exports = async function(){
  try {
    const org =      context.values.get(`billing-org`);
    const username = context.values.get(`billing-username`);
    const password = context.values.get(`billing-password`);
  
    const scheme = `https`;
    const host = `cloud.mongodb.com`;
    const path = `/api/atlas/v1.0/orgs/${org}/invoices/pending`;
    
    const collection = context.services.get(`mongodb-atlas`).db(`billing`).collection(`billingdata`);
    
    console.log(`getdata: calling the billing API`);

    const response = await context.http.get({ digestAuth: true, scheme: scheme, host: host, username: username, password: password, path: path })
    const doc = await JSON.parse(response.body.text());
    await collection.updateOne({ "id": doc.id }, doc, { "upsert": true });

    console.log(`getdata: success!`);
  }
  catch (err) {
    console.log(`getdata failed: ${err}`);
  }
};
