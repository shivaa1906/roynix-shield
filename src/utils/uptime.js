function getUptimeTimestamp(client) {
    if (!client || !client.uptime) return "N/A";

    const timestamp = Math.floor((Date.now() - client.uptime) / 1000);
    return `<t:${timestamp}:R>`; 
}

export default getUptimeTimestamp 
