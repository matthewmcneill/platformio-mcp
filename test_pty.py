import os
import pty
import sys
import subprocess

if len(sys.argv) < 2:
    sys.exit(1)

cmd = sys.argv[1:]
master_fd, slave_fd = pty.openpty()

proc = subprocess.Popen(
    cmd,
    stdin=slave_fd,
    stdout=slave_fd,
    stderr=slave_fd,
    close_fds=True
)
os.close(slave_fd)

try:
    while True:
        data = os.read(master_fd, 1024)
        if not data:
            break
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()
except OSError:
    pass
finally:
    try:
        os.close(master_fd)
    except:
        pass

proc.wait()
sys.exit(proc.returncode)
