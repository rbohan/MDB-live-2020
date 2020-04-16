exports = async function(body){
  const project = context.values.get(`auto-project`);
  const username = context.values.get(`auto-username`);
  const password = context.values.get(`auto-password`);
  const clusters = context.values.get(`auto-clusters`);

  let promises = [];
  clusters.forEach(cluster => {
    promises.push(modifyCluster(username, password, project, cluster, body));
  });
  await Promise.all(promises);

  return {"status": "success!"};
};

modifyCluster = async function(username, password, project, cluster, body) {
  const arg = { 
    "scheme": `https`, 
    "host": `cloud.mongodb.com`, 
    "path": `api/atlas/v1.0/groups/${project}/clusters/${cluster}`, 
    "username": username, 
    "password": password,
    "digestAuth": true,
    "headers": { "Content-Type": ["application/json"], "Accept-Encoding": ["bzip, deflate"] }, 
    "body": JSON.stringify(body)
  };
  
  return context.http.patch(arg)
    .then(response => {
      if (response.statusCode != 200) throw JSON.stringify({"error": JSON.parse(response.body.text()).detail});
      console.log(`- ${cluster}: ` + response.body.text());
    });
};
