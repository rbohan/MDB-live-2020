exports = function(body){
  try {
    const project = context.values.get(`auto-project`);
    const username = context.values.get(`auto-username`);
    const password = context.values.get(`auto-password`);
    const clusters = context.values.get(`auto-clusters`);

    let fns = [];
    clusters.forEach(function(cluster) {
      fns.push(modifyCluster(username, password, project, cluster, body));
    });
    Promise.all(fns);
  }
  catch (err) {
    console.error(`modifyClusters: ${err}`);
  }
  return;
};

modifyCluster = function(username, password, project, cluster, body) {
  const arg = { 
    "scheme": `https`, 
    "host": `cloud.mongodb.com`, 
    "path": `api/atlas/v1.0/groups/${project}/clusters/${cluster}`, 
    "username": username, 
    "password": password,
    "headers": { "Content-Type": ["application/json"], "Accept-Encoding": ["bzip, deflate"] }, 
    "digestAuth": true,
    "body": JSON.stringify(body)
  };
  
  return context.http.patch(arg)
  .then(response => {
    console.log(`- ${cluster}: ` + response.body.text());
  });
};
