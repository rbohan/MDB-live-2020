exports = async function(){
  try {
    const org =      context.values.get(`orgid`);
    const username = context.values.get(`publicKey`);
    const password = context.values.get(`privateKey`);

    await callAPIs(org, username, password);
    await processData();

    console.log(`getdata3: success!`);
  }
  catch (err) {
    console.log(`getdata3 failed: ${err}`);
  }
};

callAPIs = async function(org, username, password)
{
  promises = [];
  promises.push(callBillingAPI(org, username, password));
  promises.push(callOrgAPI(org, username, password));
  promises.push(callProjectAPI(org, username, password));
  return Promise.all(promises);
}

callBillingAPI = async function(org, username, password)
{
  console.log(`getdata3: calling the billing API`);
  
  const scheme = `https`;
  const host = `cloud.mongodb.com`;
  const path = `/api/atlas/v1.0/orgs/${org}/invoices/pending`;
  
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);

  const response = await context.http.get({ digestAuth: true, scheme: scheme, host: host, username: username, password: password, path: path });
  const doc = await JSON.parse(response.body.text());
  return collection.updateOne({ "id": doc.id }, doc, { "upsert": true });
};

callOrgAPI = async function(org, username, password)
{
  console.log(`getdata3: retrieving the org name`);

  const scheme = `https`;
  const host = `cloud.mongodb.com`;
  const path = `/api/atlas/v1.0/orgs/${org}`;

  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`orgdata`);
  
  const response = await context.http.get({ digestAuth: true, scheme: scheme, host: host, username: username, password: password, path: path });
  const body = await JSON.parse(response.body.text());
  const name = body.name;
  return collection.updateOne({"_id": org}, {"_id": org, "name": name}, {"upsert": true});
}

callProjectAPI = async function(org, username, password)
{
  console.log(`getdata3: retrieving project names`);

  const scheme = `https`;
  const host = `cloud.mongodb.com`;
  const path = `/api/atlas/v1.0/orgs/${org}/groups`;

  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`projectdata`);
  
  const response = await context.http.get({ digestAuth: true, scheme: scheme, host: host, username: username, password: password, path: path });
  const body = await JSON.parse(response.body.text());
  let promises = [];
  body.results.forEach(function(result) {
    promises.push(collection.updateOne({"_id": result.id}, {"_id": result.id, "name": result.name}, { "upsert": true}))
  })
  return Promise.all(promises);
}

processData = async function()
{
  console.log(`getdata3: processing data`);
  
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
    "datetime": { "$split": ["$lineItems.startDate", "T"]},
    // "details": "$lineItems"
  }});

  pipeline.push({ "$out": "details" });

  return collection.aggregate(pipeline).toArray();
};
