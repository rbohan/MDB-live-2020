exports = async function(){
  try {
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
    await collection.updateOne({ "id": doc.id }, doc, { "upsert": true });

    console.log(`getdata: success!`);
  }
  catch (err) {
    console.error(`getdata failed: ${err}`);
  }
};
