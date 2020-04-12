exports = async function(){
  console.log(`Unpausing clusters`);
  const body = { "paused": false };
  await context.functions.execute("modifyClusters", body);
  return `unpause complete!`;
};
