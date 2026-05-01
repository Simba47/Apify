require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const extractRoutes = require('./routes/extract');
const transcriptsRoutes = require('./routes/transcripts');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', extractRoutes);
app.use('/api', transcriptsRoutes);

app.listen(PORT, () => {
  console.log(`ScriptExtractor server running on http://localhost:${PORT}`);
});
