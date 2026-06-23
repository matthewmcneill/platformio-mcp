"""
DTR/RTS Reset Utility

Hardware-resets a microcontroller by toggling DTR/RTS on its serial port.
Uses the esptool 'HardReset' pattern to cleanly cycle the ESP32's EN pin
via the auto-reset circuit on CH340/CH9102-based dev boards.

Usage: python3 dtr_reset.py <port> [baud]
"""

import sys
import time


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 dtr_reset.py <port> [baud]", file=sys.stderr)
        sys.exit(1)

    port = sys.argv[1]
    baud = int(sys.argv[2]) if len(sys.argv) > 2 else 115200

    import serial
    s = serial.Serial(port, baud)

    # Step 1: Deassert both — known good baseline
    s.dtr = False
    s.rts = False
    time.sleep(0.05)

    # Step 2: Assert RTS only — pull EN low (reset)
    s.rts = True
    time.sleep(0.1)

    # Step 3: Release — ESP32 boots normally (GPIO0 floats high)
    s.rts = False
    s.dtr = False
    time.sleep(0.05)

    s.close()
    print(f"Device reset on {port} @ {baud} baud")


if __name__ == "__main__":
    main()
