const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({
  version: 'v4',
  auth
});

module.exports = {
  sheets,
  SPREADSHEET_ID: process.env.SPREADSHEET_ID,
  SHEET_NAME: 'Журнал посещений'
};
