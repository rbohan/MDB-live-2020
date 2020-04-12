exports = async function(){
  try {
    const org =      context.values.get(`billing-org`);
    const username = context.values.get(`billing-username`);
    const password = context.values.get(`billing-password`);

    await callAPI(org, username, password);
    await processData();

    console.log(`getdata2: success!`);
  }
  catch (err) {
    console.log(`getdata2 failed: ${err}`);
  }
};

callAPI = async function(org, username, password)
{
  console.log(`getdata2: calling the billing API`);
  
  const scheme = `https`;
  const host = `cloud.mongodb.com`;
  const path = `/api/atlas/v1.0/orgs/${org}/invoices/pending`;
  
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);

  const response = await context.http.get({ digestAuth: true, scheme: scheme, host: host, username: username, password: password, path: path })
  const doc = await JSON.parse(response.body.text());
  return collection.updateOne({ "id": doc.id }, doc, { "upsert": true });
};

processData = async function()
{
  console.log(`getdata2: processing data`);
  
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);

  let pipeline = [];
  pipeline.push({ "$unwind": { "path": "$lineItems", "preserveNullAndEmptyArrays": true }});
  pipeline.push({ "$project": { "_id": 0 }});
  pipeline.push({ "$out": "details" });

  return collection.aggregate(pipeline).toArray();
};
