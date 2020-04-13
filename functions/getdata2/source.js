exports = async function(){
  try {
    await callAPI();
    await processData();
    console.log(`getdata2: success!`);
  }
  catch (err) {
    console.error(`getdata2 failed: ${err}`);
  }
};

callAPI = async function()
{
  console.log(`getdata2: calling the billing API`);
  
  const org =      context.values.get(`billing-org`);
  const username = context.values.get(`billing-username`);
  const password = context.values.get(`billing-password`);

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

processData = async function()
{
  console.log(`getdata2: processing data`);
  
  let pipeline = [];
  pipeline.push({ "$unwind": { "path": "$lineItems", "preserveNullAndEmptyArrays": true }});
  pipeline.push({ "$project": { "_id": 0 }});
  pipeline.push({ "$out": "details" });

  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);
  return collection.aggregate(pipeline).toArray();
};
