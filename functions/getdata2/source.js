exports = async function(){
  await getData();
  await processData();
  return {"status": "success!"};
};

getData = async function()
{
  const org =      context.values.get(`billing-org`);
  const username = context.values.get(`billing-username`);
  const password = context.values.get(`billing-password`);

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
  if (response.statusCode != 200) throw {"status": response.status};

  const body = JSON.parse(response.body.text());
  return collection.updateOne({ "id": body.id }, body, { "upsert": true });
};

processData = async function()
{
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);

  let pipeline = [];
  pipeline.push({ "$unwind": { "path": "$lineItems", "preserveNullAndEmptyArrays": true }});
  pipeline.push({ "$project": { "_id": 0 }});
  pipeline.push({ "$out": "details" });

  return collection.aggregate(pipeline).toArray();
};
