const { DatabaseConnection } = require('./build/data');
const { Server } = require('./build/server');

let db = new DatabaseConnection(new Server());
db.queryDB(DatabaseConnection.FormatString);