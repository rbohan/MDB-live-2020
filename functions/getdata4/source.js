exports = function(){
  // find the last date in our materialized output (so we know where we are)
  // need to do this before we update any data!
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`details`);
  return collection.find({},{"date":1, "_id":0}).sort({"date": -1}).limit(1).toArray()
    .then(dates => {
      const date = (dates.length && (dates[0].date instanceof Date) ? dates[0].date : undefined);
      // console.log(`getdata4: date filter = ${date}`);
      return getData()
        .then(() => { return processData(date); })
        .then(() => { return verifyData(date); });
    })
    .then(result => { return {"status": (result ? "success!" : "failed")} });
};

getData = function()
{
  const org =      context.values.get(`billing-org`);
  const username = context.values.get(`billing-username`);
  const password = context.values.get(`billing-password`);

  const promises = [
    getInvoices(org, username, password).catch(err => { return err; }),
    getOrg(org, username, password).catch(err => { return err; }),
    getProjects(org, username, password).catch(err => { return err; }),
  ];
  return Promise.all(promises);
};

getInvoices = function(org, username, password)
{
  const args = {
    "scheme": `https`,
    "host": `cloud.mongodb.com`,
    "username": username,
    "password": password,
    "digestAuth": true,
    "path": `/api/atlas/v1.0/orgs/${org}/invoices`
  };
  
  return context.http.get(args)
    .then(response => {
      const body = JSON.parse(response.body.text());
      if (response.statusCode != 200) throw JSON.stringify({"error": body.detail});
      let promises = [];
      body.results.forEach(result => {
        promises.push(getInvoice(org, username, password, result.id)
          .catch(err => { return err; }));
      });
      return Promise.all(promises);
    });
};

getInvoice = function(org, username, password, invoice)
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
  
  return context.http.get(args)
    .then(response => {
      const body = JSON.parse(response.body.text());
      if (response.statusCode != 200) throw JSON.stringify({"error": body.detail});
      return collection.updateOne({"id": body.id}, body, {"upsert": true});
    });
};

getOrg = function(org, username, password)
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

  return context.http.get(args)
    .then(response => {
      const body = JSON.parse(response.body.text());
      if (response.statusCode != 200) throw JSON.stringify({"error": body.detail});
      return collection.updateOne({"_id": org}, {"_id": org, "name": body.name}, {"upsert": true});
    });
};

getProjects = function(org, username, password)
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
  
  return context.http.get(args)
    .then(response => {
      const body = JSON.parse(response.body.text());
      if (response.statusCode != 200) throw JSON.stringify({"error": body.detail});
      let promises = [];
      body.results.forEach(result => {
        promises.push(collection.updateOne({"_id": result.id}, {"_id": result.id, "name": result.name}, {"upsert": true})
          .catch(err => { return err; }));
      });
      return Promise.all(promises);
    });
};

processData = function(date)
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
  }});

  pipeline.push({ "$merge": { "into": "details" }});

  return collection.aggregate(pipeline).toArray();
};

verifyData = function()
{
  // make sure the number of docs in the lineItems array matches the data in the details collection
  return Promise.all([countSrc(), countDst()])
    .then(function(results) {
      return results[0] == results[1];
    });
};

countSrc = function()
{
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);
  let pipeline = [];
  pipeline.push({ "$unwind": { "path": "$lineItems", "preserveNullAndEmptyArrays": false }});
  pipeline.push({ "$count": "id" });
  return collection.aggregate(pipeline).toArray()
    .then(docs => {
      return docs[0].id;
    });
};

countDst = function()
{
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`details`);
  return collection.count({});
};
