exports = function(){
  console.log(`Updating billing data`);

  const org =      context.values.get('orgid');
  const username = context.values.get('publicKey');
  const password = context.values.get('privateKey');

  const scheme = `https`;
  const host = `cloud.mongodb.com`;
  const path = `/api/atlas/v1.0/orgs/${org}/invoices/pending`;
  
  const collection = context.services.get("mongodb-atlas").db("billing").collection("billingdata");
  
  return context.http
    .get({ digestAuth: true, scheme: scheme, host: host, username: username, password: password, path: path })
    .then(response => {
      const body = JSON.parse(response.body.text());
      if (body.error) {
        console.error(`Error ${body.error}: '${body.detail}'`);
      } else {
        const doc = body;
        console.log(`getBillingData: Upserting new doc with '${doc.lineItems.length}' lineItems`);
        return collection.updateOne({ "id": doc.id }, doc, { "upsert": true });
      }
    })
    .catch(err => console.error(`getBillingData: Failed to insert billing doc: ${err}`));
};
