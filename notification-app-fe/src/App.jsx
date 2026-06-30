import React, { useEffect, useState } from "react";
import {
  AppBar, Toolbar, Typography, Container, Tabs, Tab, List, ListItem,
  ListItemText, Chip, Box, CircularProgress, ToggleButtonGroup, ToggleButton
} from "@mui/material";
import axios from "axios";

const TYPE_WEIGHT = { Placement: 3, Result: 2, Event: 1 };

function computeScore(n) {
  const w = TYPE_WEIGHT[n.Type] || 0;
  const t = new Date(n.Timestamp).getTime();
  return w * 1e15 + t;
}

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < tokenExpiry - 30) return cachedToken;

  const res = await axios.post("http://4.224.186.213/evaluation-service/auth", {
    email: "2303051050975@paruluniversity.ac.in",
    name: "Urvashi Gautam",
    rollNo: "2303051050975",
    accessCode: "cJqaEB",
    clientID: "bfe52750-1f8f-405c-b33b-3e4cb976abaa",
    clientSecret: "QpqZpgpmDgXMXusG",
  });
  cachedToken = res.data.access_token;
  tokenExpiry = res.data.expires_in;
  return cachedToken;
}

export default function App() {
  const [tab, setTab] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = useState(new Set());
  const [filterType, setFilterType] = useState(null);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const token = await getToken();
      const res = await axios.get(
        "http://4.224.186.213/evaluation-service/notifications",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNotifications(res.data.notifications || []);
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = (id) => {
    setReadIds((prev) => new Set(prev).add(id));
  };

  const allFiltered = filterType
    ? notifications.filter((n) => n.Type === filterType)
    : notifications;

  const priorityTop10 = [...notifications]
    .map((n) => ({ ...n, score: computeScore(n) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const displayList = tab === 0 ? allFiltered : priorityTop10;

  const typeColor = (type) =>
    type === "Placement" ? "success" : type === "Result" ? "primary" : "default";

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6">Campus Notification Center</Typography>
        </Toolbar>
      </AppBar>

      <Container sx={{ mt: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="All Notifications" />
          <Tab label="Priority Inbox (Top 10)" />
        </Tabs>

        {tab === 0 && (
          <ToggleButtonGroup
            value={filterType}
            exclusive
            onChange={(_, val) => setFilterType(val)}
            sx={{ mb: 2 }}
            size="small"
          >
            <ToggleButton value={null}>All</ToggleButton>
            <ToggleButton value="Placement">Placement</ToggleButton>
            <ToggleButton value="Result">Result</ToggleButton>
            <ToggleButton value="Event">Event</ToggleButton>
          </ToggleButtonGroup>
        )}

        {loading ? (
          <Box display="flex" justifyContent="center" mt={4}>
            <CircularProgress />
          </Box>
        ) : displayList.length === 0 ? (
          <Typography color="text.secondary">No notifications to show.</Typography>
        ) : (
          <List>
            {displayList.map((n) => (
              <ListItem
                key={n.ID}
                onClick={() => markAsRead(n.ID)}
                sx={{
                  mb: 1,
                  borderRadius: 1,
                  bgcolor: readIds.has(n.ID) ? "grey.100" : "background.paper",
                  border: "1px solid",
                  borderColor: readIds.has(n.ID) ? "grey.300" : "primary.light",
                  cursor: "pointer",
                }}
                secondaryAction={
                  <Chip
                    label={n.Type}
                    color={typeColor(n.Type)}
                    size="small"
                  />
                }
              >
                <ListItemText
                  primary={n.Message}
                  secondary={new Date(n.Timestamp).toLocaleString()}
                  primaryTypographyProps={{
                    fontWeight: readIds.has(n.ID) ? 400 : 700,
                  }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Container>
    </Box>
  );
}