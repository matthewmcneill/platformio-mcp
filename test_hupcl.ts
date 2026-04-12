import { SerialPort } from "serialport";
const port = new SerialPort({ path: "/dev/tty", baudRate: 115200, hupcl: false } as any);
