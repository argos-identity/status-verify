# HAProxy Dockerfile for SLA Monitor system
FROM haproxy:2.8-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Create haproxy user and directories
RUN addgroup -g 99 -S haproxy && \
    adduser -S -D -H -u 99 -s /sbin/nologin -G haproxy -g haproxy haproxy && \
    mkdir -p /var/lib/haproxy && \
    chown -R haproxy:haproxy /var/lib/haproxy

# Copy configuration
COPY haproxy.cfg /usr/local/etc/haproxy/haproxy.cfg

# Copy error pages
COPY errors/ /etc/haproxy/errors/

# Validate configuration
RUN haproxy -f /usr/local/etc/haproxy/haproxy.cfg -c

# Expose ports
EXPOSE 80 8404

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8404/stats || exit 1

# Run as non-root user
USER haproxy

# Start HAProxy
CMD ["haproxy", "-f", "/usr/local/etc/haproxy/haproxy.cfg"]