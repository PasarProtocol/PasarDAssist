let express = require('express');
let cookieParser = require('cookie-parser');
let bodyParser = require('body-parser');
let routeV2 = require('./routes/v2/route');
let jobs = require('./jobs/jobs');
let jobsV2 = require('./jobs/jobsV2');
let jobsEth = require('./jobs/jobsEth');
let jobsFusion = require('./jobs/jobsFusion');
let log4js = require('log4js');
let cors = require('cors');
let { DefaultDIDAdapter } =  require('@elastosfoundation/did-js-sdk');
let {DIDBackend} = require('@elastosfoundation/did-js-sdk');

log4js.configure({
    appenders: {
        file: { type: 'dateFile', filename: 'logs/pasar.log', pattern: ".yyyy-MM-dd.log", compress: true, },
        console: { type: 'stdout'}
    },
    categories: { default: { appenders: ['file', 'console'], level: 'info' } },
    pm2: true,
    pm2InstanceVar: 'INSTANCE_ID'
});
global.logger = log4js.getLogger('default');
global.fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const corsOpts = {
    origin: '*',
  
    methods: [
      'GET',
      'POST',
    ],
  
    allowedHeaders: [
      'Content-Type',
    ],
};
  

let app = express();

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(log4js.connectLogger(logger, { level: log4js.levels.INFO }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors(corsOpts));
app.use(function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});
app.use('/api/v2', routeV2);

let resolverUrl = "https://api.trinity-tech.cn/eid";
DIDBackend.initialize(new DefaultDIDAdapter(resolverUrl));

jobs.run()
jobsV2.run()
jobsEth.run();
jobsFusion.run();

module.exports = app;
