exports = async function(){
  console.log(`Pausing clusters`);
  const body = { "paused": true };
  await context.functions.execute("modifyClusters", body);
  return `pause complete!`;
};
