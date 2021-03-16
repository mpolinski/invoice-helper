import envyaml from "dotenv-yaml";
import Imap from "imap";
import { inspect } from "util";
import fs from "fs";
import base64 from "base64-stream";

envyaml.config();

const imap = new Imap({
  user: process.env.IMAP_USER,
  password: process.env.IMAP_PASSWORD,
  host: process.env.IMAP_HOST,
  port: process.env.IMAP_PORT,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
});

console.log("Starting read mail ...");

function toUpper(thing) {
  return thing && thing.toUpperCase ? thing.toUpperCase() : thing;
}

function findAttachmentParts(struct, attachments) {
  attachments = attachments || [];
  for (var i = 0, len = struct.length, r; i < len; ++i) {
    if (Array.isArray(struct[i])) {
      findAttachmentParts(struct[i], attachments);
    } else {
      if (
        struct[i].disposition &&
        ["INLINE", "ATTACHMENT"].indexOf(toUpper(struct[i].disposition.type)) >
          -1
      ) {
        attachments.push(struct[i]);
      }
    }
  }
  return attachments;
}

function getSearchCriteria() {
  const searchString = process.env.SEARCH_CRITERIA;
  const searchChunks = searchString
    .split(",")
    .map((element) =>
      element
        .trim()
        .split(":")
        .map((element) => element.trim())
    )
    .map((element) => {
      if (element.length && element.length > 1) return element;
      return element[0];
    });
  const d = new Date();
  d.setDate(d.getDate() - process.env.SEARCH_DAYS);
  searchChunks.push(["SINCE", d]);
  return searchChunks;
}

function buildAttMessageFunction(attachment) {
  var filename = "downloadedAttachments/" + attachment.params.name;
  var encoding = attachment.encoding;

  return function (msg, seqno) {
    var prefix = "(#" + seqno + ") ";
    msg.on("body", function (stream, info) {
      //Create a write stream so that we can stream the attachment to file;
      console.log(prefix + "Streaming this attachment to file", filename, info);
      var writeStream = fs.createWriteStream(filename);
      writeStream.on("finish", function () {
        console.log(prefix + "Done writing to file %s", filename);
      });

      //stream.pipe(writeStream); this would write base64 data to the file.
      //so we decode during streaming using
      if (toUpper(encoding) === "BASE64") {
        //the stream is base64 encoded, so here the stream is decode on the fly and piped to the write stream (file)
        stream.pipe(base64.decode()).pipe(writeStream);
      } else {
        //here we have none or some other decoding streamed directly to the file which renders it useless probably
        stream.pipe(writeStream);
      }
    });
    msg.once("end", function () {
      console.log(prefix + "Finished attachment %s", filename);
    });
  };
}

function openInbox(cb) {
  imap.openBox("INBOX", true, cb);
}

imap.once("ready", function () {
  openInbox(function (err, box) {
    if (err) throw err;

    const searchCriteria = getSearchCriteria();
    console.log(searchCriteria);

    imap.search(searchCriteria, (err, results) => {
      if (err) throw err;
      console.log(results);
      var f = imap.fetch(results, {
        bodies: "HEADER.FIELDS (FROM TO SUBJECT DATE)",
        struct: true,
      });

      f.on("message", function (msg, seqno) {
        console.log("Message #%d", seqno);
        var prefix = "(#" + seqno + ") ";
        msg.on("body", function (stream, info) {
          var buffer = "";
          stream.on("data", function (chunk) {
            buffer += chunk.toString("utf8");
          });
          stream.once("end", function () {
            console.log(
              prefix + "Parsed header: %s",
              inspect(Imap.parseHeader(buffer))
            );
          });
        });
        msg.once("attributes", function (attrs) {
          var attachments = findAttachmentParts(attrs.struct);
          console.log(prefix + "Has attachments: %d", attachments.length);
          for (var i = 0, len = attachments.length; i < len; ++i) {
            var attachment = attachments[i];
            console.log(
              prefix + "Fetching attachment %s",
              attachment.params.name
            );
            var f = imap.fetch(attrs.uid, {
              //do not use imap.seq.fetch here
              bodies: [attachment.partID],
              struct: true,
            });
            //build function to process attachment message
            f.on("message", buildAttMessageFunction(attachment));
          }
        });
        msg.once("end", function () {
          console.log(prefix + "Finished");
        });
      });

      f.once("error", function (err) {
        console.log("Fetch error: " + err);
      });
      f.once("end", function () {
        console.log("Done fetching all messages!");
        imap.end();
      });
    });
  });
});

imap.once("error", function (err) {
  console.log(err);
});

imap.once("end", function () {
  console.log("Connection ended");
});

imap.connect();
