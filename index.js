const puppeteer = require('puppeteer');
const { Client } = require("pg");

(async () => {

  const client = new Client({
    host: process.env.POSTGRES_URL,
    user: process.env.POSTGRES_USERNAME,
    password:process.env.POSTGRES_PASSWORD,
    database: "youtube"
  });

  while (true) {
    console.log("Starting");
    await client.connect()

    // Get tracked channels and their channel names
    let trackedChannels = {}
    let err, res = await client.query('SELECT channelid, channelname FROM channels');
    res.rows.forEach((row) => {trackedChannels[row.channelid] = row.channelname})


    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(process.env.YOUTUBE_CHANNEL);
    await autoScroll(page);
    await page.evaluate( () => {
      window.scrollBy(0, window.innerHeight);
    });
  
    const channels = await page.$$("div[id='channel']");
    let channelInfo = {}

    // There channel links that we get here will be of two types 
    // https://www.youtube.com/channel/UClOf1XXinvZsy4wKPAkro2A
    // https://www.youtube.com/user/LinusTechTips
    for (let ndx = 0; ndx < channels.length; ndx++) {
      // Get Channel Link
      let anchor = await channels[ndx].$("a");
      let href = await anchor.getProperty("href");
      let link = await href.jsonValue();
      // Get Channel Name
      let span = await channels[ndx].$("span[id='title']");
      let channelProp = await span.getProperty("innerText");
      let channelName = await channelProp.jsonValue();
      channelInfo[link] = channelName;
    }

    // It seems possible that the links with users in them could
    // change if the owner decides. So here we want to resolve the channel ID
    let trackedKeys = Object.keys(trackedChannels);
    let keys = Object.keys(channelInfo);
    for (let ndx = 0; ndx < keys.length; ndx++) {
      await page.goto(keys[ndx])
      let channelLink = await page.$("link[rel='canonical']");
      let channelIdProp = await channelLink.getProperty("href");
      let channelUrl = await channelIdProp.jsonValue();
      let channelId = channelUrl.split("/channel/")[1]
      let channelName = channelInfo[keys[ndx]]

      // New Channel 
      if (!trackedKeys.includes(channelId)) {
        console.log("Found new channel. Id: " + channelId + " Name: " + channelName)
        await client.query('INSERT INTO channels (channelid, category, channelname) VALUES ($1, $2, $3)',[channelId, "", channelName]);
      } else if (trackedChannels[channelId] != channelName) {
        console.log("Channel name changed. Id: " + channelId + " Old Name: " + trackedChannels[channelId] + " New Name: " + channelName)
        await client.query('UPDATE channels SET channelname=$1 WHERE channelid=$2',[channelName, channelId]);
      }
    }

    await browser.close();
    await client.end();

    // Check again in 6 hours
    console.log("Sleeping!");
    await sleep(21600000)
    // await sleep(5000)
  }
})();


function sleep(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}

// Jank scroll to bottom of page
async function autoScroll(page){
  let previousNumber = 0
  let sameCount = 0
  while (true) {
    await page.evaluate( () => {
      window.scrollBy(0, window.innerHeight);
    });
    const videos = await page.$$("ytd-grid-channel-renderer");
    if (videos.length == previousNumber) {
      sameCount++
    }

    if (sameCount == 300) {
      return
    }

    previousNumber = videos.length

  }
}