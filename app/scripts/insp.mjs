import { readFileSync } from "node:fs";
const svg = readFileSync("D:/Gantt_typ/app/scripts/out.svg", "utf8");
const count = (p) => (svg.match(new RegExp(p, "g")) || []).length;
console.log("e2e8f0:", count("e2e8f0"));
console.log("translate groups:", count("translate\\("));
console.log("paths:", count("<path "));
console.log("lines:", count("<line"));
console.log("viewBox:", svg.match(/viewBox="[^"]+"/)?.[0]);
console.log("primer 500:", svg.slice(0, 500));