exports = async function(){
  // find the last date in our materialized output (so we know where we are)
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`details`);
  const dates = await collection.find({},{"date":1, "_id":0}).sort({"date": -1}).limit(1).toArray();
  const date = (dates.length && (dates[0].date instanceof Date) ? dates[0].date : undefined);
  // console.log(`getdata4: date filter = ${date}`);

  await getData();
  await processData(date);

  return {"status": "success!"};
};

getData = async function()
{
  const org =      context.values.get(`billing-org`);
  const username = context.values.get(`billing-username`);
  const password = context.values.get(`billing-password`);

  promises = [];
  promises.push(getInvoices(org, username, password));
  promises.push(getOrg(org, username, password));
  promises.push(getProjects(org, username, password));
  return Promise.all(promises);
}

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

  return collection.updateOne({ "id": body.id }, body, { "upsert": true });
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

  return collection.updateOne({"_id": org}, {"_id": org, "name": body.name}, {"upsert": true});
}

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
    promises.push(collection.updateOne({"_id": result.id}, {"_id": result.id, "name": result.name}, { "upsert": true}))
  });
  return Promise.all(promises);
}

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
  pipeline.push({ "$unwind": { "path": "$orgdata", "preserveNullAndEmptyArrays": true }});

  pipeline.push({ "$unwind": { "path": "$lineItems", "preserveNullAndEmptyArrays": true }});
  pipeline.push({ "$addFields": {
    "date": { "$dateFromString": { dateString: "$lineItems.startDate" }},
    "datetime": { "$split": ["$lineItems.startDate", "T"]}
  }});

  // only process the new data
  // (where the date is greater than the last one we've processed)
  if (date instanceof Date) {
    pipeline.push({ "$match": { "date": { "$gt": date }}});
  }

  pipeline.push({ "$lookup": {
    "from": "projectdata",
    "localField": "lineItems.groupId",
    "foreignField": "_id",
    "as": "projectdata"
  }});
  pipeline.push({ "$unwind": { "path": "$projectdata", "preserveNullAndEmptyArrays": true }});

  pipeline.push({ "$project": {
    "_id": 0,
    "org": { "id": "$orgId", "name": { "$ifNull": ["$orgdata.name", "$orgId" ]} },
    "project": { "id": "$lineItems.groupId", "name": { "$ifNull": ["$projectdata.name", "$lineItems.groupId" ]} },
    "cluster": { "$ifNull": ["$lineItems.clusterName", "--n/a--" ]},
    "sku": "$lineItems.sku",
    "cost": { "$toDecimal": { "$divide": [ "$lineItems.totalPriceCents", 100 ]}},
    "date": 1,
    "datetime": 1
  }});

  pipeline.push({ "$merge": { "into": "details" }});

  return collection.aggregate(pipeline).toArray();
};
