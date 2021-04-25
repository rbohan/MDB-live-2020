// version 2: grabs the 'pending' invoice & stores it in the 'billingdata' collection
// aggregation used to unwind the 'lineItems' field
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

processData = async function()
{
  const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);

  let pipeline = [];
  // not interested in empty lineItem records
  pipeline.push({ "$unwind": { "path": "$lineItems", "preserveNullAndEmptyArrays": false }});
  pipeline.push({ "$project": { "_id": 0 }});
  pipeline.push({ "$out": "details" });

  return collection.aggregate(pipeline).toArray();
};
