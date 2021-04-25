// version 3: grabs the 'pending' invoice & stores it in the 'billingdata' collection
// also grabs org & project data to augment the invoice data with org & project names
// aggregation used to unwind the 'lineItems' field
// additional projection stages used to reshape the output document
// resulting data stored in the 'details' collection via a '$out' aggregation stage
exports = async function()
{
  await getData();
  await processData();
  return {"status": "success!"};
};

getData = async function()
{
  const org =      context.values.get(`billing-org`);
  const username = context.values.get(`billing-username`);
  const password = context.values.get(`billing-password`);

  const promises = [
    getInvoice(org, username, password),
    getOrg(org, username, password),
    getProjects(org, username, password),
  ];
  return Promise.all(promises);
};

getInvoice = async function(org, username, password)
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

processData = async function()
{
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);
  
  let pipeline = [];
  
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
    "date": { "$dateFromString": { dateString: "$lineItems.startDate" }},
  }});

  pipeline.push({ "$out": "details" });

  return collection.aggregate(pipeline).toArray();
};
