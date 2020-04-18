// version 1: grabs the 'pending' invoice & stores it in the 'billingdata' collection
exports = function()
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

  return context.http.get(args)
    .then(response => {
      const body = JSON.parse(response.body.text());
      if (response.statusCode != 200) throw JSON.stringify({"error": body.detail});
      return collection.updateOne({"id": body.id}, body, {"upsert": true});
    })
    .then(() => { return {"status": "success!"}; });
};
