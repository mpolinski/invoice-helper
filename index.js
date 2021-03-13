//require('dotenv-yaml').config();
import envyaml from 'dotenv-yaml';
import fs from 'fs';
// import base64 from 'base64-stream';
import path from 'path';
// import { simpleParser } from 'mailparser';
import Imap from 'imap';

envyaml.config()

// host gmail
const imap = new Imap({
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    host: process.env.IMAP_HOST,
    port: process.env.IMAP_PORT,
    tls: true,
});
console.log('Starting read mail ...');

imap.once('ready', () => {
    imap.openBox('INBOX', false, (err, box) => {
        if (err) {
            console.log(err);
        }
    })
});

imap.search(['UNSEEN', ['HEADER', 'SUBJECT','hello world']], (err1, results) => {
    if (err1) {
        console.log(err1);
    }
});
