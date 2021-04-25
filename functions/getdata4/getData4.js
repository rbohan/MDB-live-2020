// version 4: grabs all invoice data & stores it in the 'billingdata' collection
// also grabs org & project data to augment the invoice data with org & project names
// aggregation used to unwind the 'lineItems' field
// additional match stages used to filter out old data
// additional projection stages used to reshape the output document
// additional fields added in the pipeline to categorize the data
// resulting data stored in the 'details' collection via a '$merge' aggregation stage
// additional verification step to check no duplicate data created
// note: for best performance add an index on the 'date' field (descending) in the 'details' collection
exports = async function()
{
  // find the last date in our materialized output (so we know where we are)
  // need to do this before we update any data!
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`details`);
  const dates = await collection.find({},{"date":1, "_id":0}).sort({"date": -1}).limit(1).toArray();
  const date = (dates.length && (dates[0].date instanceof Date) ? dates[0].date : undefined);
  // console.log(`getdata4: date filter = ${date}`);
  await getData();
  await processData(date);
  return {"status": (await verifyData() ? "success!" : "failed")};
};

getData = async function()
{
  const org =      context.values.get(`billing-org`);
  const username = context.values.get(`billing-username`);
  const password = context.values.get(`billing-password`);

  const promises = [
    getInvoices(org, username, password),
    getOrg(org, username, password),
    getProjects(org, username, password),
  ];
  return Promise.all(promises);
};

getInvoices = async function(org, username, password)
{
  const args = {
    "scheme": `https`,
    "host": `cloud.mongodb.com`,
    "username": username,
    "password": password,
    "digestAuth": true,
    "path": `/api/atlas/v1.0/orgs/${org}/invoices`
  };
  
  const response = await context.http.get(args);
  const body = JSON.parse(response.body.text());
  if (response.statusCode != 200) throw {"error": body.detail};
  let promises = [];
  body.results.forEach(result => {
    promises.push(getInvoice(org, username, password, result.id));
  });
  return Promise.all(promises);
};

getInvoice = async function(org, username, password, invoice)
{
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);

  const args = {
    "scheme": `https`,
    "host": `cloud.mongodb.com`,
    "username": username,
    "password": password,
    "digestAuth": true,
    "path": `/api/atlas/v1.0/orgs/${org}/invoices/${invoice}`
  };
  
  const response = await context.http.get(args);
  const body = JSON.parse(response.body.text());
  if (response.statusCode != 200) throw {"error": body.detail};
  return collection.replaceOne({"id": body.id}, body, {"upsert": true});
};

getOrg = async function(org, username, password)
{
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`orgdata`);

  const args = {
    "scheme": `https`,
    "host": `cloud.mongodb.com`,
    "username": username,
    "password": password,
    "digestAuth": true,
    "path": `/api/atlas/v1.0/orgs/${org}`
  };

  const response = await context.http.get(args);
  const body = JSON.parse(response.body.text());
  if (response.statusCode != 200) throw {"error": body.detail};
  return collection.replaceOne({"_id": org}, {"_id": org, "name": body.name}, {"upsert": true});
};

getProjects = async function(org, username, password)
{
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`projectdata`);

  const args = {
    "scheme": `https`,
    "host": `cloud.mongodb.com`,
    "username": username,
    "password": password,
    "digestAuth": true,
    "path": `/api/atlas/v1.0/orgs/${org}/groups`
  };
  
  const response = await context.http.get(args);
  const body = JSON.parse(response.body.text());
  if (response.statusCode != 200) throw {"error": body.detail};
  let promises = [];
  body.results.forEach(result => {
    promises.push(collection.replaceOne({"_id": result.id}, {"_id": result.id, "name": result.name}, {"upsert": true}));
  });
  return Promise.all(promises);
};

processData = async function(date)
{
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);

  let pipeline = [];
  
  // quick filter to avoid processing older invoices
  // (anything where the endData is more recent than
  // a month prior to the last date we've processed)
  if (date instanceof Date) {
    const startfrom = new Date(date - 1000 * 3600 * 24 * 31);
    pipeline.push({ "$match": { "endDate": { "$gte": JSON.stringify(startfrom) }}});
  }

  pipeline.push({ "$lookup": {
    "from": "orgdata",
    "localField": "orgId",
    "foreignField": "_id",
    "as": "orgdata"
  }});
  // some records may not have an org so need to preserve them
  pipeline.push({ "$unwind": { "path": "$orgdata", "preserveNullAndEmptyArrays": true }});

  // not interested in empty lineItem records
  pipeline.push({ "$unwind": { "path": "$lineItems", "preserveNullAndEmptyArrays": false }});

  // only process the new data
  // (where the date is greater than the last one we've processed)
  pipeline.push({ "$addFields": { "date": { "$dateFromString": { dateString: "$lineItems.startDate" }}}});
  if (date instanceof Date) {
    pipeline.push({ "$match": { "date": { "$gt": date }}});
  }

  pipeline.push({ "$lookup": {
    "from": "projectdata",
    "localField": "lineItems.groupId",
    "foreignField": "_id",
    "as": "projectdata"
  }});
  // some records may not have a project so need to preserve them
  pipeline.push({ "$unwind": { "path": "$projectdata", "preserveNullAndEmptyArrays": true }});

  pipeline.push({ "$project": {
    "_id": 0,
    "org": { "id": "$orgId", "name": { "$ifNull": ["$orgdata.name", "$orgId" ]} },
    "project": { "id": "$lineItems.groupId", "name": { "$ifNull": ["$projectdata.name", "$lineItems.groupId" ]} },
    "cluster": { "$ifNull": ["$lineItems.clusterName", "--n/a--" ]},
    "sku": "$lineItems.sku",
    "cost": { "$toDecimal": { "$divide": [ "$lineItems.totalPriceCents", 100 ]}},
    "date": 1,
    "provider": {
      "$switch": {
        "branches": [
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "AWS" }},
            "then": "AWS"
          },
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "AZURE" }},
            "then": "AZURE"
          },
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "GCP" }},
            "then": "GCP"
          },
        ],
        "default": "n/a"
      }
    },
    "instance": { "$ifNull": [{ "$arrayElemAt": [ { "$split": ["$lineItems.sku", "_INSTANCE_"] }, 1 ] }, "non-instance"]},
    "category": {
      "$switch": {
        "branches": [
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "_INSTANCE" }},
            "then": "instances"
          },
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "BACKUP" }},
            "then": "backup"
          },
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "PIT_RESTORE" }},
            "then": "backup"
          },
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "DATA_TRANSFER" }},
            "then": "data xfer"
          },
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "STORAGE" }},
            "then": "storage"
          },
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "BI_CONNECTOR" }},
            "then": "bi connector"
          },
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "DATA_LAKE" }},
            "then": "data lake"
          },
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "AUDITING" }},
            "then": "audit"
          },
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "FREE_SUPPORT" }},
            "then": "free support"
          },
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "CHARTS" }},
            "then": "charts"
          },
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "STITCH" }},
            "then": "stitch"
          },
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "SECURITY" }},
            "then": "security"
          },
          {
            "case": { "$regexMatch": { "input": "$lineItems.sku", "regex": "PRIVATE_ENDPOINT" }},
            "then": "private endpoint"
          },
        ],
        "default": "other"
      }
    },
  }});
  pipeline.push({ "$merge": { "into": "details" }});

  return collection.aggregate(pipeline).toArray();
};

verifyData = async function()
{
  // make sure the number of docs in the lineItems array matches the data in the details collection
  const results = await Promise.all([countSrc(), countDst()]);
  return results[0] == results[1];
};

countSrc = async function()
{
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);
  let pipeline = [];
  pipeline.push({ "$unwind": { "path": "$lineItems", "preserveNullAndEmptyArrays": false }});
  pipeline.push({ "$count": "id" });
  const docs = await collection.aggregate(pipeline).toArray();
  return docs[0].id;
};

countDst = async function()
{
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`details`);
  return collection.count({});
};
