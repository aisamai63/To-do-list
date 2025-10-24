import React, { useEffect, useMemo, useState, useCallback } from "react";
import Draggable from "react-draggable";
import ToastContainer from "./Toast";

// Log the React version at runtime to help debug findDOMNode issues
if (typeof React !== "undefined" && React && React.version) {
  // eslint-disable-next-line no-console
  console.log("React version:", React.version);
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  // Simpler inputs: date (day) + time for easier selection and clearer UI
  const [dueDay, setDueDay] = useState(""); // YYYY-MM-DD
  const [dueTime, setDueTime] = useState(""); // HH:MM
  const [now, setNow] = useState(new Date());
  const [adding, setAdding] = useState(false);
  const [zTop, setZTop] = useState(10); // raise dragged card to front
  const [apiHealthy, setApiHealthy] = useState(true);
  const [lastAddError, setLastAddError] = useState(null);
  const [lastAddPayload, setLastAddPayload] = useState(null);
  // Toasts for lightweight notifications
  const [toasts, setToasts] = useState([]);

  // Editing state
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [editDue, setEditDue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Use env base if defined (Option A), otherwise allow CRA proxy (Option B)
  const API_BASE = process.env.REACT_APP_API_BASE || "";

  // Load tasks with retryable loader and apiHealthy flag
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/tasks`);
      if (!res.ok) throw new Error(`GET /tasks ${res.status}`);
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
      setApiHealthy(true);
    } catch (err) {
      console.error("Error fetching tasks:", err);
      setApiHealthy(false);
      setTasks([]);
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Load persisted lastAddPayload from localStorage (so retry survives reload)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("lastAddPayload");
      if (raw) {
        const parsed = JSON.parse(raw);
        setLastAddPayload(parsed);
        setLastAddError({
          status: "saved",
          body: "Recovered from previous session",
        });
      }
    } catch (e) {
      // ignore parse errors
    }
  }, []);

  // Toast helpers
  const showToast = (message, type = "info", timeout = 4000) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    setToasts((s) => [...s, { id, message, type }]);
    if (timeout > 0)
      setTimeout(() => setToasts((s) => s.filter((t) => t.id !== id)), timeout);
  };
  const removeToast = (id) => setToasts((s) => s.filter((t) => t.id !== id));

  // Live clock + refresh for status colors
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000); // tick each second for header clock
    const minute = setInterval(() => setNow(new Date()), 60000); // color refresh safety
    return () => {
      clearInterval(t);
      clearInterval(minute);
    };
  }, []);

  // Helpers
  const safeDate = (d) => {
    const t = d ? new Date(d) : null;
    return t && !isNaN(t) ? t : null;
  };

  const getStatus = (d) => {
    const due = safeDate(d);
    if (!due) return { bg: "#f9fafb", label: "No due date" };
    const diff = due - now;
    if (diff < 0) return { bg: "#fde2e4", label: "⚠️ Overdue" };
    if (diff < 24 * 60 * 60 * 1000)
      return { bg: "#fff2cd", label: "⏰ Due soon" };
    return { bg: "#dcf7e6", label: "✅ On track" };
  };

  // Initial card placement if no saved position
  const nextInitialPos = (i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 24 + col * 320 + Math.floor(Math.random() * 18);
    const y = 24 + row * 160 + Math.floor(Math.random() * 12);
    return { x, y };
  };

  // Add new task (accepts optional payload to support retry)
  const addTask = async (payload) => {
    const textVal = payload?.text ?? text;
    if (!textVal || !textVal.trim()) return;
    setAdding(true);
    try {
      const initPos = nextInitialPos(tasks.length);
      // Prefer full dueDate if provided; else compose from dueDay + dueTime or payload
      let payloadDue = payload?.dueDate ?? dueDate ?? null;
      if (!payloadDue && (payload?.dueDay || dueDay)) {
        const day = payload?.dueDay ?? dueDay;
        const time = (payload?.dueTime ?? dueTime) || "00:00";
        payloadDue = `${day}T${time}`; // e.g. 2025-10-24T19:30
      }

      const body = { text: textVal, dueDate: payloadDue, position: initPos };
      const res = await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // capture response body for debugging
        let bodyText;
        try {
          bodyText = await res.text();
        } catch (e) {
          bodyText = "<unable to read body>";
        }
        console.error("POST /tasks failed", res.status, bodyText);
        // Save last failed payload so user can retry
        setLastAddPayload(body);
        try {
          localStorage.setItem("lastAddPayload", JSON.stringify(body));
        } catch (e) {
          // ignore storage errors
        }
        setLastAddError({ status: res.status, body: bodyText });
        throw new Error(`POST /tasks failed (${res.status})`);
      }
      const newTask = await res.json();
      setTasks((prev) => [...prev, newTask]);
      // clear inputs only when user-initiated (not when retrying)
      setText("");
      setDueDate("");
      setDueDay("");
      setDueTime("");
      // clear any previous failed state
      setLastAddError(null);
      setLastAddPayload(null);
      try {
        localStorage.removeItem("lastAddPayload");
      } catch (e) {}
      showToast("Task added", "success");
    } catch (e) {
      console.error("Failed to add task:", e);
      // give user more info if available
      showToast("Could not add the task. Please try again.", "error");
    } finally {
      setAdding(false);
    }
  };

  // Retry the last failed add (repopulate fields and call addTask)
  const retryLastAdd = async () => {
    if (!lastAddPayload) return;
    showToast("Retrying last failed add...", "info");
    // If there's a payload, call addTask with it directly
    await addTask(lastAddPayload);
  };

  // Toggle completion
  const toggleComplete = async (id, completed) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !completed }),
      });
      if (!res.ok) throw new Error(`PUT /tasks/${id} failed (${res.status})`);
      const updatedTask = await res.json();
      setTasks((prev) => prev.map((t) => (t._id === id ? updatedTask : t)));
    } catch (e) {
      console.error(e);
      showToast("Could not update the task. Please try again.", "error");
    }
  };

  // Delete
  const deleteTask = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${id}`, { method: "DELETE" });
      if (!res.ok)
        throw new Error(`DELETE /tasks/${id} failed (${res.status})`);
      setTasks((prev) => prev.filter((t) => t._id !== id));
      // If we deleted the edited one, exit editing
      if (editingId === id) {
        setEditingId(null);
        setEditText("");
        setEditDue("");
      }
    } catch (e) {
      console.error(e);
      showToast("Could not delete the task. Please try again.", "error");
    }
  };

  // Begin edit
  const startEdit = (task) => {
    setEditingId(task._id);
    setEditText(task.text || "");
    // Convert ISO to yyyy-MM-ddTHH:mm for datetime-local
    const dt = safeDate(task.dueDate);
    const isoLocal = dt
      ? new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16)
      : "";
    setEditDue(isoLocal);
  };

  // Cancel edit
  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
    setEditDue("");
    setSavingEdit(false);
  };

  // Save edit
  const saveEdit = async (id) => {
    if (!editText.trim()) {
      showToast("Task text is required.", "error");
      return;
    }
    setSavingEdit(true);
    try {
      const payload = { text: editText.trim() };
      if (editDue)
        payload.dueDate = editDue; // send string; backend converts to Date
      else payload.dueDate = null;

      const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`PUT /tasks/${id} failed (${res.status})`);
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t._id === id ? updated : t)));
      cancelEdit();
    } catch (e) {
      console.error(e);
      showToast("Could not save changes. Please try again.", "error");
      setSavingEdit(false);
    }
  };

  // Drag behavior
  const bringToFront = (id) => {
    setZTop((n) => n + 1);
    setTasks((prev) =>
      prev.map((t) => (t._id === id ? { ...t, __z: zTop + 1 } : t))
    );
  };

  const onDrag = (id, data) => {
    setTasks((prev) =>
      prev.map((t) =>
        t._id === id ? { ...t, position: { x: data.x, y: data.y } } : t
      )
    );
  };

  const onStop = async (id, data) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: { x: data.x, y: data.y } }),
      });
      if (!res.ok) throw new Error(`PUT /tasks/${id} failed (${res.status})`);
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t._id === id ? updated : t)));
    } catch (e) {
      console.error(e);
    }
  };

  // Stats for header
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed).length;
    const overdue = tasks.filter((t) => {
      const d = safeDate(t.dueDate);
      return d && d < now && !t.completed;
    }).length;
    const soon = tasks.filter((t) => {
      const d = safeDate(t.dueDate);
      if (!d) return false;
      const diff = d - now;
      return diff >= 0 && diff < 24 * 60 * 60 * 1000 && !t.completed;
    }).length;
    return { total, completed, overdue, soon };
  }, [tasks, now]);

  // Sort (render order only)
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return da - db;
    });
  }, [tasks]);

  // --- styles (inline to keep this single-file) ---
  const styles = {
    app: {
      minHeight: "100vh",
      padding: "32px 16px",
      background:
        "radial-gradient(1200px 600px at 20% -10%, #e8f0ff 0%, transparent 60%), " +
        "radial-gradient(1000px 500px at 120% 10%, #fff0e8 0%, transparent 60%), " +
        "linear-gradient(180deg, #f8fafc 0%, #f5f7fb 100%)",
      color: "#0f172a",
      fontFamily:
        "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    },
    header: {
      maxWidth: 980,
      margin: "0 auto 12px",
      padding: "14px 16px",
      borderRadius: 16,
      background:
        "linear-gradient(135deg, rgba(37,99,235,0.10), rgba(16,185,129,0.10))",
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 12,
      boxShadow: "0 10px 30px rgba(2,6,23,0.08)",
    },
    titleWrap: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      minWidth: 250,
    },
    title: {
      margin: 0,
      fontSize: 26,
      background: "linear-gradient(135deg, #2563eb 0%, #16a34a 100%)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      fontWeight: 800,
      letterSpacing: "0.3px",
    },
    clock: { fontSize: 13, opacity: 0.85 },
    statBar: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
      marginLeft: "auto",
    },
    chip: {
      fontSize: 12,
      padding: "4px 10px",
      borderRadius: 999,
      background: "rgba(15,23,42,0.06)",
    },
    controls: {
      maxWidth: 980,
      margin: "12px auto 20px",
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      alignItems: "center",
    },
    input: {
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid #e5e7eb",
      background: "#fff",
      fontSize: 14,
      flex: "1 1 280px",
    },
    dt: {
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid #e5e7eb",
      background: "#fff",
      fontSize: 14,
      flex: "0 0 220px",
    },
    button: {
      padding: "10px 12px",
      borderRadius: 10,
      border: "none",
      background: "#2563eb",
      color: "#fff",
      cursor: "pointer",
      boxShadow: "0 6px 16px rgba(37,99,235,0.2)",
      opacity: adding ? 0.7 : 1,
    },
    board: {
      position: "relative",
      maxWidth: 980,
      minHeight: "68vh",
      margin: "0 auto",
      borderRadius: 16,
      background: "rgba(255,255,255,0.7)",
      boxShadow:
        "inset 0 0 0 1px rgba(15,23,42,0.05), 0 12px 28px rgba(2,6,23,0.08)",
      overflow: "hidden",
    },
    cardBase: {
      position: "absolute",
      width: 300,
      maxWidth: "88vw",
      userSelect: "none",
      cursor: "grab",
      borderRadius: 14,
      padding: "12px 12px 10px",
      boxShadow: "0 10px 30px rgba(2,6,23,0.15), 0 2px 8px rgba(2,6,23,0.06)",
      border: "1px solid rgba(15,23,42,0.08)",
      backdropFilter: "blur(6px)",
      transition: "box-shadow 0.15s ease, transform 0.12s ease",
    },
    row: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
    },
    titleText: (completed) => ({
      fontWeight: 700,
      lineHeight: 1.25,
      textDecoration: completed ? "line-through" : "none",
      wordBreak: "break-word",
    }),
    footer: {
      marginTop: 8,
      fontSize: 12,
      color: "#334155",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
      opacity: 0.9,
    },
    tag: {
      fontSize: 11,
      padding: "2px 8px",
      borderRadius: 999,
      background: "rgba(15,23,42,0.06)",
      whiteSpace: "nowrap",
    },
    btn: {
      border: "none",
      borderRadius: 10,
      padding: "6px 10px",
      color: "#fff",
      fontSize: 12,
      cursor: "pointer",
      marginLeft: 6,
    },
    btnComplete: { background: "#16a34a" },
    btnUndo: { background: "#f59e0b" },
    btnDelete: { background: "#dc2626" },
    btnEdit: { background: "#2563eb" },
    editWrap: { marginTop: 10, display: "grid", gap: 8 },
    editRow: { display: "flex", gap: 8, alignItems: "center" },
    editInput: {
      flex: 1,
      padding: "8px 10px",
      borderRadius: 10,
      border: "1px solid #e5e7eb",
      background: "#fff",
    },
    editBtn: {
      border: "none",
      borderRadius: 10,
      padding: "6px 12px",
      cursor: "pointer",
      color: "#fff",
      background: "#2563eb",
    },
    cancelBtn: {
      border: "none",
      borderRadius: 10,
      padding: "6px 12px",
      cursor: "pointer",
      color: "#111827",
      background: "#e5e7eb",
    },
    previewText: {
      fontSize: 13,
      color: "#0f172a",
      opacity: 0.9,
      minWidth: 200,
    },
    miniButton: {
      padding: "8px 10px",
      borderRadius: 10,
      border: "none",
      background: "#f97316",
      color: "#fff",
      cursor: "pointer",
      fontSize: 13,
    },
    banner: {
      maxWidth: 980,
      margin: "8px auto",
      padding: "10px 12px",
      borderRadius: 10,
      display: "flex",
      gap: 8,
      alignItems: "center",
      justifyContent: "space-between",
      background: "#fff1f2",
      border: "1px solid #fecaca",
      color: "#7f1d1d",
    },
  };

  // Clock string
  const clockStr = now.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div style={styles.app}>
      {/* API health banner */}
      {!apiHealthy && (
        <div style={styles.banner}>
          <div>⚠️ API unreachable — some features will not work.</div>
          <div>
            <button
              onClick={() => fetchTasks()}
              style={{ ...styles.miniButton, background: "#2563eb" }}
            >
              Try reconnect
            </button>
          </div>
        </div>
      )}
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.titleWrap}>
          <span style={{ fontSize: 26 }}>🗓️</span>
          <h1 style={styles.title}>Your Task Playground</h1>
        </div>
        <div style={styles.statBar}>
          <span style={styles.chip}>Total: {stats.total}</span>
          <span style={styles.chip}>✅ Completed: {stats.completed}</span>
          <span style={styles.chip}>⏰ Due soon: {stats.soon}</span>
          <span style={styles.chip}>⚠️ Overdue: {stats.overdue}</span>
          <span style={{ ...styles.chip, background: "rgba(37,99,235,0.10)" }}>
            {clockStr}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <input
          type="text"
          placeholder="Enter a task..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          style={styles.input}
        />
        {/* Modern date + time inputs */}
        <input
          type="date"
          value={dueDay}
          onChange={(e) => setDueDay(e.target.value)}
          style={{ ...styles.dt, flex: "0 0 180px", padding: "10px 12px" }}
          title="Pick date"
        />
        <input
          type="time"
          value={dueTime}
          onChange={(e) => setDueTime(e.target.value)}
          style={{ ...styles.dt, flex: "0 0 140px", padding: "10px 12px" }}
          title="Pick time"
        />
        {/* due date preview + icons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🗓️</span>
          <div style={styles.previewText}>
            {(() => {
              // compute preview from dueDate or dueDay+dueTime
              const composed =
                dueDate || (dueDay ? `${dueDay}T${dueTime || "00:00"}` : null);
              const dt = safeDate(composed);
              return dt
                ? dt.toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "No due date";
            })()}
          </div>
        </div>
        <button onClick={addTask} disabled={adding} style={styles.button}>
          {adding ? "Adding..." : "Add Task"}
        </button>
        {/* Retry last add if it failed */}
        {lastAddError && (
          <button
            onClick={retryLastAdd}
            style={{ ...styles.miniButton, background: "#ef4444" }}
          >
            Retry last add
          </button>
        )}
      </div>

      {/* Drag surface */}
      <div style={styles.board} id="board">
        {sortedTasks.map((task, i) => {
          const dt = safeDate(task.dueDate);
          const formatted = dt
            ? dt.toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "No due date";
          const { bg, label } = getStatus(task.dueDate);
          const defaultPos =
            task.position &&
            typeof task.position.x === "number" &&
            typeof task.position.y === "number"
              ? undefined
              : nextInitialPos(i);
          const zIndex = task.__z ?? 10;
          const isEditing = editingId === task._id;

          return (
            <Draggable
              key={task._id}
              bounds="parent"
              defaultPosition={defaultPos}
              position={task.position ?? undefined}
              onStart={() => bringToFront(task._id)}
              onDrag={(_, data) => onDrag(task._id, data)}
              onStop={(_, data) => onStop(task._id, data)}
              disabled={isEditing} // prevent dragging while editing
            >
              <div style={{ ...styles.cardBase, background: bg, zIndex }}>
                <div style={styles.row}>
                  <div style={styles.titleText(task.completed)}>
                    {task.text}
                  </div>
                  <div>
                    <button
                      onClick={() => startEdit(task)}
                      style={{ ...styles.btn, ...styles.btnEdit }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleComplete(task._id, task.completed)}
                      style={{
                        ...styles.btn,
                        ...(task.completed
                          ? styles.btnUndo
                          : styles.btnComplete),
                      }}
                    >
                      {task.completed ? "Undo" : "Complete"}
                    </button>
                    <button
                      onClick={() => deleteTask(task._id)}
                      style={{ ...styles.btn, ...styles.btnDelete }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Edit panel */}
                {isEditing && (
                  <div style={styles.editWrap}>
                    <div style={styles.editRow}>
                      <input
                        style={styles.editInput}
                        type="text"
                        placeholder="Task text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                      />
                    </div>
                    <div style={styles.editRow}>
                      <input
                        style={styles.editInput}
                        type="datetime-local"
                        value={editDue}
                        onChange={(e) => setEditDue(e.target.value)}
                      />
                    </div>
                    <div style={styles.editRow}>
                      <button
                        onClick={() => saveEdit(task._id)}
                        disabled={savingEdit}
                        style={styles.editBtn}
                      >
                        {savingEdit ? "Saving..." : "Save"}
                      </button>
                      <button onClick={cancelEdit} style={styles.cancelBtn}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Footer */}
                {!isEditing && (
                  <div style={styles.footer}>
                    <span>
                      ⏰ <strong>Due:</strong> {formatted}
                    </span>
                    <span style={styles.tag}>{label}</span>
                  </div>
                )}
              </div>
            </Draggable>
          );
        })}
      </div>
      {/* Toasts */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

export default App;
