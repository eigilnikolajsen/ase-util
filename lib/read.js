"use strict";

import iconv from "iconv-lite";

// For more information about the ASE format see: http://www.selapa.net/swatches/colors/fileformats.php#adobe_ase
var ASE_SIGNATURE = 0x41534546;
var ASE_VERSION_MAYOR = 1;
var ASE_VERSION_MINOR = 0;
var ASE_BLOCK_TYPE_COLOR = 0x1;
var ASE_BLOCK_TYPE_GROUP_START = 0xc001;
var ASE_BLOCK_TYPE_GROUP_END = 0xc002;
var ASE_COLOR_TYPES = ["global", "spot", "normal"];

// Using our own version of assert to throw an specific error type instead of AssertionError
function assert(condition, message, ErrorType) {
  ErrorType = ErrorType || Error;
  if (!condition) {
    throw new ErrorType(message);
  }
}

function readBlocks(arrayBuffer, offset) {
  const dataView = new DataView(arrayBuffer);
  var result = [],
    numBlocks = dataView.getUint32(8, false);

  for (var i = 0; i < numBlocks; i++) {
    offset += readBlock(dataView, offset, result);
  }

  return result;
}

function readBlock(dataView, offset, result) {
  var type = dataView.getUint16(offset, false),
    blockLength = dataView.getUint32(offset + 2, false);

  switch (type) {
    case ASE_BLOCK_TYPE_COLOR:
      result.push(readColorEntry(dataView, offset + 6));
      break;
    case ASE_BLOCK_TYPE_GROUP_START:
      result.push(readGroupStart(dataView, offset + 6));
      break;
    case ASE_BLOCK_TYPE_GROUP_END:
      result.push({ type: "group-end" });
      break;
    default:
      throw new Error(
        "Unsupported type " + type.toString(16) + " at offset " + offset
      );
  }

  return 6 + blockLength;
}

function readColorEntry(dataView, offset) {
  var nameLength = dataView.getUint16(offset, false);

  return {
    type: "color",
    name: readUTF16BE(dataView, offset + 2, nameLength),
    color: readColor(dataView, offset + 2 + nameLength * 2),
  };
}

function readColor(dataView, offset) {
  var model = new TextDecoder("utf-8")
    .decode(new Uint8Array(dataView.buffer, offset, 4))
    .trim();
  var r, g, b, gray;

  switch (model) {
    case "RGB":
      return {
        model: model,
        r: (r = dataView.getFloat32(offset + 4, false)),
        g: (g = dataView.getFloat32(offset + 8, false)),
        b: (b = dataView.getFloat32(offset + 12, false)),
        hex: componentToHex(r) + componentToHex(g) + componentToHex(b),
        type: ASE_COLOR_TYPES[dataView.getUint16(offset + 16, false)],
      };
    case "CMYK":
      return {
        model: model,
        c: dataView.getFloat32(offset + 4, false),
        m: dataView.getFloat32(offset + 8, false),
        y: dataView.getFloat32(offset + 12, false),
        k: dataView.getFloat32(offset + 16, false),
        type: ASE_COLOR_TYPES[dataView.getUint16(offset + 20, false)],
      };
    case "Gray":
      return {
        model: model,
        gray: (gray = dataView.getFloat32(offset + 4, false)),
        hex: componentToHex(gray) + componentToHex(gray) + componentToHex(gray),
        type: ASE_COLOR_TYPES[dataView.getUint16(offset + 8, false)],
      };
    case "LAB":
      return {
        model: model,
        lightness: dataView.getFloat32(offset + 4, false),
        a: dataView.getFloat32(offset + 8, false),
        b: dataView.getFloat32(offset + 12, false),
        type: ASE_COLOR_TYPES[dataView.getUint16(offset + 16, false)],
      };
    default:
      throw new Error(
        "Unsupported color model: " + model + " at offset " + offset
      );
  }
}

function componentToHex(value) {
  var hex = ((value * 255) | 0).toString(16).toUpperCase();
  return hex.length === 1 ? "0" + hex : hex;
}

function readGroupStart(dataView, offset) {
  var nameLength = dataView.getUint16(offset, false);
  return {
    type: "group-start",
    name: readUTF16BE(dataView, offset + 2, nameLength),
  };
}

function readUTF16BE(dataView, offset, length) {
  const bytes = new Uint8Array(dataView.buffer, offset, (length - 1) * 2);
  return iconv.decode(bytes, "utf16be");
}

function createGroups(accumulated, item) {
  var last = accumulated[accumulated.length - 1];

  if (last && last.type === "group-start") {
    if (item.type === "group-end") {
      last.type = "group";
    } else {
      last.entries.push(item);
    }
  } else if (item.type === "group-start") {
    item.entries = [];
    accumulated.push(item);
  } else {
    accumulated.push(item);
  }
  return accumulated;
}

export default function (arrayBuffer) {
  assert(
    arrayBuffer instanceof ArrayBuffer,
    "The argument is not an instance of ArrayBuffer",
    TypeError
  );
  const dataView = new DataView(arrayBuffer);
  assert(
    dataView.getUint32(0, false) === ASE_SIGNATURE,
    "Invalid file signature: ASEF header expected"
  );
  assert(
    dataView.getUint16(4, false) === ASE_VERSION_MAYOR,
    "Only version 1.0 of the ASE format is supported"
  );
  assert(
    dataView.getUint16(6, false) === ASE_VERSION_MINOR,
    "Only version 1.0 of the ASE format is supported"
  );

  return readBlocks(arrayBuffer, 12).reduce(createGroups, []);
}
