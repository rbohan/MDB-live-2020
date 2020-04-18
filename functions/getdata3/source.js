exports = function(){
  return getData()
    .then(() => { return processData(); })
    .then(result => { return {"status": "success!", "result": result}; });
};

getData = function()
{
  const org =      context.values.get(`billing-org`);
  const username = context.values.get(`billing-username`);
  const password = context.values.get(`billing-password`);

  const promises = [
    getInvoice(org, username, password).catch(err => { return err; }),
    getOrg(org, username, password).catch(err => { return err; }),
    getProjects(org, username, password).catch(err => { return err; }),
  ];
  return Promise.all(promises);
};

getInvoice = function(org, username, password)
{
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);

  const args = {
    "scheme": `https`,
    "host": `cloud.mongodb.com`,
    "username": username,
    "password": password,
    "digestAuth": true,
    "path": `/api/atlas/v1.0/orgs/${org}/invoices/pending`
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
          .catch(err => { return err; }),);
      });
      return Promise.all(promises);
    });
};

processData = function()
{
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);
  
  let pipeline = [];
  
  pipeline.push({ "$lookup": {
    "from": "orgdata",
    "localField": "orgId",
    "foreignField": "_id",
    "as": "orgdata"
  }});
  pipeline.push({ "$unwind": { "path": "$orgdata", "preserveNullAndEmptyArrays": true }});

  pipeline.push({ "$unwind": { "path": "$lineItems", "preserveNullAndEmptyArrays": true }});
  
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
    "date": { "$dateFromString": { dateString: "$lineItems.startDate" }},
  }});

  pipeline.push({ "$out": "details" });

  return collection.aggregate(pipeline).toArray();
};
