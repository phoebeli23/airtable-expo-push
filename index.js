const Expo = require('expo-server-sdk');
const Airtable = require('airtable');
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const AirtableColumnEnum = Object.freeze({
  timePosted: 'timePosted'
});

const expo = new Expo.Expo();
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID,
);

class NotificationsManager {
  constructor() {
    this.pushSettings = {};
  }

  addNotification(settings) {
    this.pushSettings[settings.table] =  settings;
  }

  createPushMessages(records, settings) {
    records = records.filter((record) => {
      const currTime = record.get(AirtableColumnEnum.timePosted);
      const diffInSeconds = (Date.now() - Date.parse(currTime)) / 1000;
      const isNewRecord = diffInSeconds <= (process.env['SECONDS_INTERVAL'] | 0);
      return record.get(settings.tokenColumnName) && isNewRecord;
    });

    return records.map((record) => {
      return {
        to: record.get(settings.tokenColumnName),
        body: settings.recordTemplate(record),
        sound: 'default',
      };
    });
  }

  async sendNotifications() {
    let messages = [];
    for (const table in this.pushSettings) {
      const settings = this.pushSettings[table];

      await base(settings.table).select(settings.queryParams).eachPage(
        async (records, fetchNextPage) => {
          const newMessages = this.createPushMessages(records, settings);
          messages = messages.concat(newMessages);
          fetchNextPage();
        }
      );
    }

    let chunks = expo.chunkPushNotifications(messages);
    let tickets = [];
    (async () => {
      // Send the chunks to the Expo push notification service. There are
      // different strategies you could use. A simple one is to send one chunk at a
      // time, which nicely spreads the load out over time:
      for (let chunk of chunks) {
        try {
          let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
          console.log("Notification chunk sent");
          // NOTE: If a ticket contains an error code in ticket.details.error, you
          // must handle it appropriately. The error codes are listed in the Expo
          // documentation:
          // https://docs.expo.io/versions/latest/guides/push-notifications#response-format
        } catch (error) {
          console.log(error);
        }
      }
    })();
  }
}