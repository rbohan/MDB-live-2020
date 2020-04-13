exports = async function(){
  try {
    // find the last date in our materialized output (so we know where we are)
    const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`details`);
    const dates = await collection.find({},{"date":1, "_id":0}).sort({"date": -1}).limit(1).toArray();
    const date = (dates.length && (dates[0].date instanceof Date) ? dates[0].date : undefined);
    console.log(`getdata4: date filter = ${date}`);

    await callAPIs();
    await processData(date);

    console.log(`getdata4: success!`);
  }
  catch (err) {
    console.error(`getdata4 failed: ${err}`);
  }
};

callAPIs = async function()
{
  const org =      context.values.get(`billing-org`);
  const username = context.values.get(`billing-username`);
  const password = context.values.get(`billing-password`);

  promises = [];
  promises.push(callBillingAPIs(org, username, password));
  promises.push(callOrgAPI(org, username, password));
  promises.push(callProjectAPI(org, username, password));
  return Promise.all(promises);
}

callBillingAPIs = async function(org, username, password)
{
  console.log(`getdata4: calling the billing APIs`);
  
  const args = {
    "digestAuth": true,
    "scheme": `https`,
    "host": `cloud.mongodb.com`,
    "username": username,
    "password": password,
    "path": `/api/atlas/v1.0/orgs/${org}/invoices`
  };
  
  const response = await context.http.get(args);
  const body = await JSON.parse(response.body.text());

  let promises = [];
  body.results.forEach(function(result) {
    promises.push(getInvoice(org, username, password, result.id));
  });
  return Promise.all(promises);
};

getInvoice = async function(org, username, password, invoice)
{
  const args = {
    "digestAuth": true,
    "scheme": `https`,
    "host": `cloud.mongodb.com`,
    "username": username,
    "password": password,
    "path": `/api/atlas/v1.0/orgs/${org}/invoices/${invoice}`
  };
  
  const response = await context.http.get(args);
  const doc = await JSON.parse(response.body.text());

  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);
  return collection.updateOne({ "id": doc.id }, doc, { "upsert": true });
};

callOrgAPI = async function(org, username, password)
{
  console.log(`getdata4: retrieving org name(s)`);

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
  console.log(`getdata4: retrieving project name(s)`);

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

processData = async function(date)
{
  console.log(`getdata4: processing data`);
  
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
