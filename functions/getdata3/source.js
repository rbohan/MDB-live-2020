exports = async function(){
  try {
    await callAPIs();
    await processData();

    console.log(`getdata3: success!`);
  }
  catch (err) {
    console.log(`getdata3 failed: ${err}`);
  }
};

callAPIs = async function()
{
  const org =      context.values.get(`billing-org`);
  const username = context.values.get(`billing-username`);
  const password = context.values.get(`billing-password`);

  promises = [];
  promises.push(callBillingAPI(org, username, password));
  promises.push(callOrgAPI(org, username, password));
  promises.push(callProjectAPI(org, username, password));
  return Promise.all(promises);
}

callBillingAPI = async function(org, username, password)
{
  console.log(`getdata3: calling the billing API`);
  
  const args = {
    "digestAuth": true,
    "scheme": `https`,
    "host": `cloud.mongodb.com`,
    "username": username,
    "password": password,
    "path": `/api/atlas/v1.0/orgs/${org}/invoices/pending`
  };
  
  const response = await context.http.get(args);
  const doc = await JSON.parse(response.body.text());

  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);
  return collection.updateOne({ "id": doc.id }, doc, { "upsert": true });
};

callOrgAPI = async function(org, username, password)
{
  console.log(`getdata3: retrieving the org name`);

  const args = {
    "digestAuth": true,
    "scheme": `https`,
    "host": `cloud.mongodb.com`,
    "username": username,
    "password": password,
    "path": `/api/atlas/v1.0/orgs/${org}`
  };
  
  const response = await context.http.get(args);
  const body = await JSON.parse(response.body.text());

  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`orgdata`);
  return collection.updateOne({"_id": org}, {"_id": org, "name": body.name}, {"upsert": true});
}

callProjectAPI = async function(org, username, password)
{
  console.log(`getdata3: retrieving project names`);

  const args = {
    "digestAuth": true,
    "scheme": `https`,
    "host": `cloud.mongodb.com`,
    "username": username,
    "password": password,
    "path": `/api/atlas/v1.0/orgs/${org}/groups`
  };

  const response = await context.http.get(args);
  const body = await JSON.parse(response.body.text());

  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`projectdata`);
  let promises = [];
  body.results.forEach(function(result) {
    promises.push(collection.updateOne({"_id": result.id}, {"_id": result.id, "name": result.name}, { "upsert": true}))
  });
  return Promise.all(promises);
}

processData = async function()
{
  console.log(`getdata3: processing data`);
  
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
    "datetime": { "$split": ["$lineItems.startDate", "T"]}
  }});

  pipeline.push({ "$out": "details" });

  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);
  return collection.aggregate(pipeline).toArray();
};
