#!/usr/bin/env python3
"""Connect to signal-cli's SSE stream and print every event."""

import http.client
import sys


def main() -> None:
    host = sys.argv[1] if len(sys.argv) > 1 else "localhost"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080

    connection = http.client.HTTPConnection(host, port, timeout=None)
    connection.request("GET", "/api/v1/events")
    response = connection.getresponse()

    if response.status != 200:
        print(f"Failed: status {response.status}")
        sys.exit(1)

    print(f"Connected to {host}:{port}, listening...")
    while True:
        line = response.readline()
        if not line:
            print("Stream closed.")
            break
        print(line.decode("utf-8").rstrip("\n\r"))


if __name__ == "__main__":
    main()
