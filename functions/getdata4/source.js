exports = async function(){
  try {
    const org =      context.values.get(`orgid`);
    const username = context.values.get(`publicKey`);
    const password = context.values.get(`privateKey`);

    await callAPIs(org, username, password);
    await processData();

    console.log(`getdata4: success!`);
  }
  catch (err) {
    console.log(`getdata4 failed: ${err}`);
  }
};

callAPIs = async function(org, username, password)
{
  promises = [];
  promises.push(callBillingAPIs(org, username, password));
  promises.push(callOrgAPI(org, username, password));
  promises.push(callProjectAPI(org, username, password));
  return Promise.all(promises);
}

callBillingAPIs = async function(org, username, password)
{
  console.log(`getdata4: calling the billing APIs`);
  
  const scheme = `https`;
  const host = `cloud.mongodb.com`;
  const path = `/api/atlas/v1.0/orgs/${org}/invoices`;
  
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);

  const response = await context.http.get({ digestAuth: true, scheme: scheme, host: host, username: username, password: password, path: path });
  const body = await JSON.parse(response.body.text());
  let promises = [];
  body.results.forEach(function(result) {
    promises.push(getInvoice(org, username, password, result.id));
  })
  return Promise.all(promises);
};

getInvoice = async function(org, username, password, invoice)
{
  const scheme = `https`;
  const host = `cloud.mongodb.com`;
  const path = `/api/atlas/v1.0/orgs/${org}/invoices/${invoice}`;
  
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);

  const response = await context.http.get({ digestAuth: true, scheme: scheme, host: host, username: username, password: password, path: path });
  const doc = await JSON.parse(response.body.text());
  return collection.updateOne({ "id": doc.id }, doc, { "upsert": true });
};

callOrgAPI = async function(org, username, password)
{
  console.log(`getdata4: retrieving org name(s)`);

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
  console.log(`getdata4: retrieving project name(s)`);

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
  console.log(`getdata4: processing data`);
  
  const details = context.services.get(`mongodb-atlas`).db(`billing`).collection(`details`);
  const billingdata = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);

  const dates = await details.find({},{"date":1, "_id":0}).sort({"date": -1}).limit(1).toArray();

  let pipeline = [];
  
  // quick filter to avoid processing older invoices
  // (anything where the endData is a month ago or later)
  if (dates.length && dates[0].date) {
    const date = new Date(dates[0].date - 1000 * 3600 * 24 * 31);
    const strdate = JSON.stringify(date);
    pipeline.push({ "$match": { "endDate": { "$gte": strdate }}});
  }

  pipeline.push({ "$lookup": {
    "from": "orgdata",
    "localField": "orgId",
    "foreignField": "_id",
    "as": "orgdata"
  }});
  pipeline.push({ "$unwind": { "path": "$orgdata", "preserveNullAndEmptyArrays": true }});

  pipeline.push({ "$unwind": { "path": "$lineItems", "includeArrayIndex": "index", "preserveNullAndEmptyArrays": true }});
  pipeline.push({ "$addFields": {
    "date": { "$dateFromString": { dateString: "$lineItems.startDate" }},
    "datetime": { "$split": ["$lineItems.startDate", "T"]}
  }});

  // only process new data
  // (where the date is greater than the last one we've processed)
  if (dates.length && dates[0].date) {
    pipeline.push({ "$match": { "date": { "$gt": dates[0].date }}});
  }

  pipeline.push({ "$lookup": {
    "from": "projectdata",
    "localField": "lineItems.groupId",
    "foreignField": "_id",
    "as": "projectdata"
  }});
  pipeline.push({ "$unwind": { "path": "$projectdata", "preserveNullAndEmptyArrays": true }});

  pipeline.push({ "$project": {
    "_id": { "id": "$_id", "index": "$index" },
    "org": { "id": "$orgId", "name": { "$ifNull": ["$orgdata.name", "$orgId" ]} },
    "project": { "id": "$lineItems.groupId", "name": { "$ifNull": ["$projectdata.name", "$lineItems.groupId" ]} },
    "cluster": { "$ifNull": ["$lineItems.clusterName", "--n/a--" ]},
    "sku": "$lineItems.sku",
    "cost": { "$toDecimal": { "$divide": [ "$lineItems.totalPriceCents", 100 ]}},
    "date": 1,
    "datetime": 1,
    // "details": "$lineItems"
  }});

  pipeline.push({ "$merge": { "into": "details" }});

  return billingdata.aggregate(pipeline).toArray();
};
