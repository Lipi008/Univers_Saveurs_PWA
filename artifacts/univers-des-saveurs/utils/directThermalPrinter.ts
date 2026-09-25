export type ThermalReceiptLine = {
  name: string;
  quantity: number;
  amount: string;
};

export type ThermalReceipt = {
  logoUri?: string;
  receiptNumber: string;
  isTest?: boolean;
  date: string;
  mode: string;
  table?: string;
  lines: ThermalReceiptLine[];
  total: string;
  paymentMethod: string;
  paymentLines?: { label: string; amount: string }[];
  totalReceived?: string;
  cashTendered?: string;
  changeDue?: string;
};

type BluetoothCharacteristicLike = {
  properties: { write?: boolean; writeWithoutResponse?: boolean };
  writeValue?: (value: Uint8Array) => Promise<void>;
  writeValueWithoutResponse?: (value: Uint8Array) => Promise<void>;
};

type BluetoothServiceLike = {
  getCharacteristics: () => Promise<BluetoothCharacteristicLike[]>;
};

type BluetoothServerLike = {
  getPrimaryServices: () => Promise<BluetoothServiceLike[]>;
};

type BluetoothDeviceLike = {
  gatt?: { connected?: boolean; connect: () => Promise<BluetoothServerLike> };
};

type UsbEndpointLike = { direction: string; endpointNumber: number };
type UsbAlternateLike = { endpoints: UsbEndpointLike[] };
type UsbInterfaceLike = {
  interfaceNumber: number;
  alternate: UsbAlternateLike;
  alternates?: UsbAlternateLike[];
};
type UsbDeviceLike = {
  configuration?: { interfaces: UsbInterfaceLike[] };
  open: () => Promise<void>;
  selectConfiguration: (configurationValue: number) => Promise<void>;
  claimInterface: (interfaceNumber: number) => Promise<void>;
  selectAlternateInterface?: (interfaceNumber: number, alternateSetting: number) => Promise<void>;
  transferOut: (endpointNumber: number, data: Uint8Array) => Promise<unknown>;
  close: () => Promise<void>;
};

type DirectPrinterNavigator = Navigator & {
  bluetooth?: {
    requestDevice: (options: {
      acceptAllDevices: boolean;
      optionalServices: string[];
    }) => Promise<BluetoothDeviceLike>;
  };
  usb?: {
    requestDevice: (options: { filters: unknown[] }) => Promise<UsbDeviceLike>;
  };
};

const BLE_PRINTER_SERVICES = [
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];
let cachedBluetoothDevice: BluetoothDeviceLike | null = null;
let cachedBluetoothCharacteristic: BluetoothCharacteristicLike | null = null;
let cachedUsbDevice: UsbDeviceLike | null = null;
const logoRasterCache = new Map<string, Promise<Uint8Array | null>>();

function normalizeText(value: string) {
  return value
    .replace(/[\u00A0\u202F]/g, '.')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’]/g, "'")
    .replace(/[^\x20-\x7E]/g, '.');
}

function fitColumns(left: string, right: string, width = 32) {
  const cleanLeft = normalizeText(left);
  const cleanRight = normalizeText(right);
  const leftWidth = Math.max(1, width - cleanRight.length - 1);
  const clippedLeft = cleanLeft.slice(0, leftWidth);
  return `${clippedLeft}${' '.repeat(Math.max(1, width - clippedLeft.length - cleanRight.length))}${cleanRight}`;
}

function wrap(value: string, width: number) {
  const words = normalizeText(value).split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word.slice(0, width);
    } else if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word.slice(0, width);
    }
  }
  if (current) lines.push(current);
  return lines;
}

function joinBytes(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

async function prepareLogoToEscPos(uri: string) {
  if (typeof document === 'undefined') return null;
  const image = document.createElement('img');
  image.crossOrigin = 'anonymous';
  image.src = uri;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Le logo n'a pas pu être préparé pour l'imprimante."));
  });

  // 160 px remains legible on 58 mm paper and cuts the Bluetooth payload by
  // more than half compared with a 240 px raster.
  const maxWidth = 160;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const width = Math.max(8, Math.floor((image.naturalWidth * scale) / 8) * 8);
  const height = Math.max(1, Math.round(image.naturalHeight * (width / image.naturalWidth)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const grayscale = new Float32Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const pixel = index * 4;
    grayscale[index] = pixels[pixel + 3] < 40
      ? 255
      : (pixels[pixel] * 299 + pixels[pixel + 1] * 587 + pixels[pixel + 2] * 114) / 1000;
  }
  const bytesPerRow = width / 8;
  const raster = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const oldValue = grayscale[index];
      const newValue = oldValue < 155 ? 0 : 255;
      const error = oldValue - newValue;
      if (newValue === 0) {
        raster[y * bytesPerRow + Math.floor(x / 8)] |= 0x80 >> (x % 8);
      }
      if (x + 1 < width) grayscale[index + 1] += error * 7 / 16;
      if (y + 1 < height) {
        if (x > 0) grayscale[index + width - 1] += error * 3 / 16;
        grayscale[index + width] += error * 5 / 16;
        if (x + 1 < width) grayscale[index + width + 1] += error / 16;
      }
    }
  }

  return joinBytes([
    new Uint8Array([
      0x1d, 0x76, 0x30, 0x00,
      bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
      height & 0xff, (height >> 8) & 0xff,
    ]),
    raster,
  ]);
}

function logoToEscPos(uri: string) {
  const cached = logoRasterCache.get(uri);
  if (cached) return cached;
  const prepared = prepareLogoToEscPos(uri);
  logoRasterCache.set(uri, prepared);
  return prepared;
}

async function buildEscPosReceipt(receipt: ThermalReceipt) {
  const encoder = new TextEncoder();
  const text: string[] = [
    '\x1B\x61\x01',
    '\x1B\x45\x01',
    "L'UNIVERS DES SAVEURS",
    '\x1B\x45\x00',
    ...(receipt.isTest ? ["*** VENTE D'ESSAI ***", "AUCUN ENCAISSEMENT REEL"] : []),
    receipt.receiptNumber,
    receipt.date,
    `${receipt.mode}${receipt.table ? ` - ${receipt.table}` : ''}`,
    '\x1B\x61\x00',
    '--------------------------------',
  ];

  for (const line of receipt.lines) {
    const prefix = `${line.quantity} x `;
    const nameLines = wrap(line.name, 32 - prefix.length);
    text.push(fitColumns(`${prefix}${nameLines[0] ?? ''}`, line.amount));
    for (const continuation of nameLines.slice(1)) text.push(`    ${continuation}`);
  }

  text.push(
    '--------------------------------',
    '\x1B\x45\x01',
    fitColumns(receipt.isTest ? 'TOTAL SIMULE' : 'TOTAL A PAYER', receipt.total),
    '\x1B\x45\x00',
    receipt.isTest ? 'STATUT : ESSAI - NON PAYE' : 'STATUT : PAYE',
    fitColumns(receipt.isTest ? 'Mode simule' : 'Paiement', receipt.paymentMethod),
    ...(receipt.paymentLines ?? []).map((line) => fitColumns(line.label, line.amount)),
    ...(receipt.totalReceived ? [fitColumns('Montant recu', receipt.totalReceived)] : []),
    ...(receipt.cashTendered ? [fitColumns('Especes remises', receipt.cashTendered)] : []),
    ...(receipt.changeDue ? ['\x1B\x45\x01', fitColumns('MONNAIE', receipt.changeDue), '\x1B\x45\x00'] : []),
    '',
    '\x1B\x61\x01',
    'Merci et a bientot !',
    '\x1B\x61\x00',
    '\n\n\n',
  );

  const logo = receipt.logoUri ? await logoToEscPos(receipt.logoUri) : null;
  return joinBytes([
    new Uint8Array([0x1b, 0x40, 0x1b, 0x61, 0x01]),
    ...(logo ? [logo, encoder.encode('\n')] : []),
    encoder.encode(`${text.join('\n')}\x1D\x56\x00`),
  ]);
}

async function writeChunks(data: Uint8Array, write: (chunk: Uint8Array) => Promise<unknown>, size: number) {
  for (let offset = 0; offset < data.length; offset += size) {
    await write(data.slice(offset, offset + size));
  }
}

export function supportsDirectBluetoothPrinting() {
  return typeof navigator !== 'undefined' && Boolean((navigator as DirectPrinterNavigator).bluetooth);
}

export function supportsDirectUsbPrinting() {
  return typeof navigator !== 'undefined' && Boolean((navigator as DirectPrinterNavigator).usb);
}

export async function printReceiptOverBluetooth(receipt: ThermalReceipt) {
  const bluetooth = (navigator as DirectPrinterNavigator).bluetooth;
  if (!bluetooth) throw new Error("L'impression Bluetooth directe nécessite Chrome sur Android.");

  try {
    if (!cachedBluetoothDevice) {
      cachedBluetoothDevice = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_PRINTER_SERVICES,
      });
    }
    if (!cachedBluetoothCharacteristic || !cachedBluetoothDevice.gatt?.connected) {
      const server = await cachedBluetoothDevice.gatt?.connect();
      if (!server) throw new Error("Connexion Bluetooth impossible.");
      cachedBluetoothCharacteristic = null;
      const services = await server.getPrimaryServices();
      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        cachedBluetoothCharacteristic = characteristics.find((item) => item.properties.writeWithoutResponse || item.properties.write) ?? null;
        if (cachedBluetoothCharacteristic) break;
      }
    }
    const writable = cachedBluetoothCharacteristic;
    if (!writable) throw new Error("Le service d'impression de cette imprimante n'a pas été trouvé.");
    const data = await buildEscPosReceipt(receipt);
    if (writable.properties.writeWithoutResponse && writable.writeValueWithoutResponse) {
      await writeChunks(data, (chunk) => writable.writeValueWithoutResponse!(chunk), 180);
    } else if (writable.writeValue) {
      await writeChunks(data, (chunk) => writable.writeValue!(chunk), 180);
    } else {
      throw new Error("Le service d'impression de cette imprimante n'est pas accessible.");
    }
  } catch (error) {
    cachedBluetoothCharacteristic = null;
    if (!cachedBluetoothDevice?.gatt?.connected) cachedBluetoothDevice = null;
    throw error;
  }
}

export async function printReceiptOverUsb(receipt: ThermalReceipt) {
  const usb = (navigator as DirectPrinterNavigator).usb;
  if (!usb) throw new Error("L'impression USB directe nécessite Chrome sur Android.");

  const device = cachedUsbDevice ?? await usb.requestDevice({ filters: [] });
  cachedUsbDevice = device;
  await device.open();
  try {
    if (!device.configuration) await device.selectConfiguration(1);
    const interfaces = device.configuration?.interfaces ?? [];
    for (const usbInterface of interfaces) {
      const alternates = usbInterface.alternates ?? [usbInterface.alternate];
      const selected = alternates.find((alternate) => alternate.endpoints.some((endpoint) => endpoint.direction === 'out'));
      const endpoint = selected?.endpoints.find((item) => item.direction === 'out');
      if (!selected || !endpoint) continue;
      await device.claimInterface(usbInterface.interfaceNumber);
      await writeChunks(await buildEscPosReceipt(receipt), (chunk) => device.transferOut(endpoint.endpointNumber, chunk), 4096);
      return;
    }
    throw new Error("Aucune sortie d'impression USB n'a été trouvée.");
  } finally {
    await device.close();
  }
}