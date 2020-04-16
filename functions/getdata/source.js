exports = async function(){
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
  await collection.updateOne({ "id": body.id }, body, { "upsert": true });

  return {"status": "success!"};
};
