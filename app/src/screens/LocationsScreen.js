import { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  FlatList,
  TouchableOpacity,
  Image,
  AppState,
  ScrollView,
} from "react-native";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import api from "../api";

dayjs.extend(duration);

const ORANGE = "#D38C28";
const GRAY = "#C9CDD2";
const RED = "#E35545";
const GREEN = "#16a34a";

function fmtDuration(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function fmtRemainingMs(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;

  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");

  return `${mm}:${ss}`;
}

function getSensorLiveRemainingMs(sensor) {
  const raw = sensor?.remainingMs;

  const remainingMs =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : null;

  if (!Number.isFinite(remainingMs)) return null;

  const receivedAtMs = sensor?.receivedAt
    ? new Date(sensor.receivedAt).getTime()
    : Date.now();

  if (!Number.isFinite(receivedAtMs)) return remainingMs;

  return Math.max(0, remainingMs - (Date.now() - receivedAtMs));
}

export default function LocationsScreen() {
  const [uiState, setUiState] = useState("idle");
  const [booking, setBooking] = useState(null);
  const [selectOpen, setSelectOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState(null);
  const [tick, setTick] = useState(0);

  const [spaces, setSpaces] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loadingLoc, setLoadingLoc] = useState(false);

  const [floorOpen, setFloorOpen] = useState(false);
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [spacesForFloor, setSpacesForFloor] = useState([]);
  const [selectedSpace, setSelectedSpace] = useState(null);

  const [checkedInAt, setCheckedInAt] = useState(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [feeEstimate, setFeeEstimate] = useState(0);
  const [discountCode, setDiscountCode] = useState("");

  const refreshBookingFromServer = async () => {
    try {
      const { data } = await api.get("/bookings/me/current");

      if (!data) {
        setUiState("idle");
        setBooking(null);
        setCheckedInAt(null);
        setElapsedSec(0);
        setFeeEstimate(0);
        return;
      }

      setBooking((prev) => {
        const sensorState = String(data.sensor?.state || "").toLowerCase();

        const expiresAt =
          prev?.expiresAt ||
          (data?.created_at
            ? new Date(data.created_at).getTime() + 10 * 60 * 1000
            : null);

        return {
          reservation_id: data?.reservation_id || prev?.reservation_id || null,
          location: data?.location_name || prev?.location || "ตำแหน่งที่จอง",
          floor: data?.floor_number || prev?.floor || null,
          pole: data?.pole_label || data?.zone_code || prev?.pole || "-",
          spaceNo: data?.space_number || prev?.spaceNo || "-",
          spaceId: Number(data?.space_id || prev?.spaceId || 0) || null,
          expiresAt,
          status: data.status || prev?.status || "reserved",
          sensor: data.sensor || null,
          canCheckIn:
            data.can_check_in === true ||
            data.canCheckIn === true ||
            data.ready_to_checkin === true ||
            data.readyToCheckin === true ||
            data.sensor?.ready_to_checkin === true ||
            data.sensor?.readyToCheckin === true ||
            sensorState === "wait_confirm" ||
            sensorState === "occupied_reserved" ||
            sensorState === "occupied",
        };
      });

      if (data.status === "checked-in") {
        setUiState("parked");
        setCheckedInAt(data.checked_in_at);
        setFeeEstimate(Number(data.fee_estimate || 0));

        const base = new Date(data.checked_in_at).getTime();
        setElapsedSec(Math.floor((Date.now() - base) / 1000));
        return;
      }

      if (data.status === "reserved" || data.status === "wait_confirm") {
        setUiState("reserved");
        return;
      }

      if (
        data.status === "expired" ||
        data.status === "cancelled" ||
        data.status === "completed"
      ) {
        setUiState("idle");
        setBooking(null);
        setCheckedInAt(null);
        setElapsedSec(0);
        setFeeEstimate(0);
      }
    } catch (_) { }
  };

  useEffect(() => {
    if (uiState !== "parked") return;

    let timer = null;
    let refresher = null;

    (async () => {
      try {
        const { data } = await api.get("/bookings/me/current");
        if (data?.checked_in_at) {
          setCheckedInAt(data.checked_in_at);
          setFeeEstimate(Number(data.fee_estimate || 0));

          timer = setInterval(() => {
            const base = new Date(data.checked_in_at).getTime();
            setElapsedSec(Math.floor((Date.now() - base) / 1000));
          }, 1000);

          refresher = setInterval(async () => {
            try {
              const { data: d2 } = await api.get("/bookings/me/current");
              setFeeEstimate(Number(d2?.fee_estimate || 0));
            } catch { }
          }, 60000);
        }
      } catch { }
    })();

    return () => {
      if (timer) clearInterval(timer);
      if (refresher) clearInterval(refresher);
    };
  }, [uiState]);

  useEffect(() => {
    if (uiState !== "reserved" || !booking?.reservation_id) return;

    let alive = true;

    const poll = async () => {
      if (!alive) return;
      await refreshBookingFromServer();
    };

    poll();
    const t = setInterval(poll, 4000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [uiState, booking?.reservation_id]);

  const floorsOfSelected = useMemo(() => {
    if (!selectedLoc) return [];
    const set = new Set();

    (spaces ?? []).forEach((s) => {
      const key = String(s.location_id);
      if (key === String(selectedLoc.id)) set.add(String(s.floor_number));
    });

    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [selectedLoc, spaces]);

  useEffect(() => {
    if (uiState !== "reserved" || !booking?.expiresAt) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [uiState, booking?.expiresAt]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") refreshBookingFromServer();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    void refreshBookingFromServer();
  }, []);

  useEffect(() => {
    if (uiState !== "reserved" || !booking?.expiresAt) return;

    const now = Date.now();
    if (now >= booking.expiresAt) {
      Alert.alert("หมดเวลาการจอง", "เกิน 10 นาที ระบบยกเลิกการจองอัตโนมัติ");

      (async () => {
        if (booking?.reservation_id) {
          try {
            await api.post(`/bookings/${booking.reservation_id}/cancel`);
          } catch (_) { }
        }

        setUiState("idle");
        setBooking(null);
      })();
    }
  }, [tick]);

  useEffect(() => {
    let mounted = true;

    const loadSpaces = async () => {
      try {
        setLoadingLoc(true);
        const { data } = await api.get("/spaces");
        if (!mounted) return;

        const arr = Array.isArray(data) ? data : [];
        setSpaces(arr);

        const byLoc = new Map();

        arr.forEach((s) => {
          const key = s.location_id || s.locationId || s.location_name || "unknown";
          const name = s.location_name || s.location || `Location ${s.location_id || "-"}`;
          const floor = s.floor_number || s.floor || null;
          const free = s.current_state === "available";

          if (!byLoc.has(key)) byLoc.set(key, { id: String(key), name, floor, free });
          else if (free) byLoc.get(key).free = true;
        });

        setLocations(Array.from(byLoc.values()));
      } catch (e) {
        console.warn("Failed to load spaces", e?.message);
      } finally {
        setLoadingLoc(false);
      }
    };

    loadSpaces();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectOpen) return;

    (async () => {
      try {
        const { data } = await api.get("/spaces");
        const arr = Array.isArray(data) ? data : [];
        setSpaces(arr);

        const byLoc = new Map();

        arr.forEach((s) => {
          const key = s.location_id || s.locationId || s.location_name || "unknown";
          const name = s.location_name || s.location || `Location ${s.location_id || "-"}`;
          const floor = s.floor_number || s.floor || null;
          const free = s.current_state === "available";

          if (!byLoc.has(key)) byLoc.set(key, { id: String(key), name, floor, free });
          else if (free) byLoc.get(key).free = true;
        });

        setLocations(Array.from(byLoc.values()));
      } catch (_) { }
    })();
  }, [selectOpen]);

  const remaining = useMemo(() => {
    const sensorMs = getSensorLiveRemainingMs(booking?.sensor);
    const sensorLabel = fmtRemainingMs(sensorMs);

    if (sensorLabel) return sensorLabel;

    if (!booking?.expiresAt) return null;

    const ms = Math.max(0, booking.expiresAt - Date.now());
    const d = dayjs.duration(ms, "milliseconds");
    const mm = String(Math.floor(d.asMinutes())).padStart(2, "0");
    const ss = String(d.seconds()).padStart(2, "0");

    return `${mm}:${ss}`;
  }, [tick, booking?.expiresAt, booking?.sensor]);

  const handleReservePress = () => {
    setSelectOpen(true);
  };

  const handleSelectLocation = (loc) => {
    setSelectedLoc(loc);
    setSelectOpen(false);
    setSelectedFloor(null);
    setSelectedSpace(null);
    setSpacesForFloor([]);
    setFloorOpen(true);
  };

  const handleSelectFloor = async (floorNo) => {
    try {
      setSelectedFloor(floorNo);
      setSelectedSpace(null);

      const { data } = await api.get("/spaces", {
        params: { location_id: selectedLoc.id, floor: floorNo },
      });

      const arr = Array.isArray(data) ? data : [];
      setSpacesForFloor(arr);
      setSpaceOpen(true);
      setFloorOpen(false);
    } catch (e) {
      Alert.alert("โหลดช่องจอดไม่สำเร็จ", e?.response?.data?.message || "กรุณาลองใหม่");
    }
  };

  const handleConfirm = async () => {
    try {
      if (!selectedSpace?.space_id) {
        Alert.alert("ยังไม่ได้เลือกช่องจอด", "กรุณาเลือกช่องจอดที่ว่างก่อนยืนยัน");
        return;
      }

      if (selectedSpace.current_state !== "available") {
        Alert.alert("จองไม่ได้", "ช่องนี้ไม่ว่างแล้ว กรุณาเลือกช่องอื่น");
        return;
      }

      const start = dayjs().format("YYYY-MM-DD HH:mm:ss");
      const end = dayjs().add(70, "minute").format("YYYY-MM-DD HH:mm:ss");

      const { data } = await api.post("/bookings", {
        space_id: selectedSpace.space_id,
        start_time: start,
        end_time: end,
      });

      const expiresAt = Date.now() + 10 * 60 * 1000;

      setBooking({
        reservation_id: data?.reservation_id,
        location: selectedLoc?.name,
        floor: selectedFloor,
        pole: selectedSpace?.pole_label || selectedSpace?.zone_code || "-",
        spaceNo: selectedSpace?.space_number,
        spaceId: Number(selectedSpace?.space_id),
        expiresAt,
        status: data?.status || "reserved",
        sensor: data?.sensor || null,
        canCheckIn: data?.can_check_in === true || data?.canCheckIn === true,
      });

      setUiState("reserved");
    } catch (e) {
      Alert.alert("จองไม่สำเร็จ", e?.response?.data?.message || "เกิดข้อผิดพลาด");
    } finally {
      setConfirmOpen(false);
      setSpaceOpen(false);
    }
  };

  const handleConfirmParking = async () => {
    try {
      if (!booking?.reservation_id) return;

      const { data } = await api.post(`/bookings/${booking.reservation_id}/checkin`);

      const checkedAt =
        data?.checked_in_at ||
        data?.booking?.checked_in_at ||
        data?.checkedInAt;

      if (checkedAt) {
        setCheckedInAt(checkedAt);
        const base = new Date(checkedAt).getTime();
        setElapsedSec(Math.floor((Date.now() - base) / 1000));
      }

      const fee =
        data?.fee_estimate ||
        data?.booking?.fee_estimate ||
        data?.feeEstimate;

      if (fee != null) setFeeEstimate(Number(fee || 0));

      setBooking((prev) =>
        prev
          ? {
            ...prev,
            status: data?.status || data?.booking?.status || "checked-in",
            sensor: data?.sensor || data?.booking?.sensor || prev.sensor || null,
            canCheckIn: false,
          }
          : prev
      );

      setUiState("parked");
    } catch (e) {
      const status = e?.response?.status;
      const message = e?.response?.data?.message;

      if (status === 409) {
        Alert.alert(
          "ยังยืนยันไม่ได้",
          "กรุณาขับรถเข้าช่องจอดก่อน ระบบกำลังรอข้อมูลจากเซนเซอร์"
        );
        return;
      }

      if (status === 403) {
        Alert.alert(
          "สิทธิ์ไม่ถูกต้อง",
          "ข้อมูลเซนเซอร์ไม่ตรงกับผู้ใช้งานปัจจุบัน"
        );
        return;
      }

      Alert.alert("ยืนยันการจอดไม่สำเร็จ", message || "กรุณาลองใหม่");
    }
  };

  const handleCancel = async () => {
    try {
      if (booking?.reservation_id) {
        await api.post(`/bookings/${booking.reservation_id}/cancel`);
      }
    } catch (_) { }

    setUiState("idle");
    setBooking(null);
  };

  const handleApplyDiscount = async () => {
    try {

      if (!discountCode.trim()) {
        Alert.alert(
          "แจ้งเตือน",
          "กรุณากรอกรหัสส่วนลด"
        );
        return;
      }

      await api.post(
        `/bookings/${booking?.reservation_id}/apply-discount`,
        {
          code: discountCode.trim()
        }
      );

      Alert.alert(
        "สำเร็จ",
        "ใช้รหัสส่วนลดเรียบร้อย"
      );

      setDiscountCode("");

      await refreshBookingFromServer();

    } catch (e) {

      Alert.alert(
        "ไม่สำเร็จ",
        e?.response?.data?.message ||
        "ใช้รหัสไม่สำเร็จ"
      );

    }
  };

  const handleComplete = async () => {
    if (!booking?.reservation_id) return;

    try {
      const { data } = await api.post(`/bookings/${booking.reservation_id}/complete`);
      const fee = Number(data?.total_fee || 0);

      Alert.alert("เสร็จสิ้นการจอด", `ค่าจอดรวม ${fee.toFixed(2)} บาท`);

      setUiState("idle");
      setBooking(null);
      setCheckedInAt(null);
      setElapsedSec(0);
      setFeeEstimate(0);
    } catch (e) {
      Alert.alert("ไม่สำเร็จ", e?.response?.data?.message || "กรุณาลองใหม่");
    }
  };

  const canConfirmParking = useMemo(() => {
    return (
      uiState === "reserved" &&
      !!booking?.reservation_id &&
      booking?.canCheckIn === true
    );
  }, [uiState, booking?.reservation_id, booking?.canCheckIn]);

  const reservationLabel = useMemo(() => {
    if (uiState === "idle") return { text: "ยังไม่จอง", color: RED };
    if (uiState === "parked") return { text: "กำลังจอดอยู่", color: GREEN };
    if (canConfirmParking) return { text: "พร้อมยืนยันการจอด", color: GREEN };
    return { text: "จองแล้ว • รอรถเข้าช่อง", color: ORANGE };
  }, [uiState, canConfirmParking]);

  const Header = () => (
    <>
      <View style={styles.topBar} />
      <Text style={styles.caption}>สถานะที่จอดรถ</Text>
      <Text style={[styles.status, { color: reservationLabel.color }]}>
        {reservationLabel.text}
      </Text>
    </>
  );

  const Lot = () => (
    <View style={styles.lotBox}>
      <View style={styles.hLineTop} />
      <View style={styles.hLineBottom} />
      <View style={styles.vLineLeft} />
      <View style={styles.vLineRight} />

      {uiState === "idle" && (
        <Pressable style={styles.bookArea} onPress={handleReservePress} accessibilityRole="button">
          <Text style={styles.bookLabel}>จองที่จอดรถ</Text>
          <View style={styles.circle}>
            <Text style={styles.plus}>＋</Text>
          </View>
        </Pressable>
      )}

      {uiState === "reserved" && (
        <View style={styles.centerCtaWrap}>
          {canConfirmParking ? (
            <Pressable
              onPress={handleConfirmParking}
              style={styles.centerCta}
              accessibilityRole="button"
            >
              <Text style={styles.centerCtaText}>ยืนยันการจอด</Text>
            </Pressable>
          ) : (
            <View style={[styles.centerCta, styles.centerCtaDisabled]}>
              <Text style={styles.centerCtaText}>รอรถเข้าช่องจอด</Text>
            </View>
          )}

          <Text style={styles.countdown}>
            {remaining
              ? canConfirmParking
                ? `พร้อมยืนยัน • หมดเวลาใน ${remaining}`
                : `ระบบกำลังรอข้อมูลจากเซนเซอร์ • หมดเวลาใน ${remaining}`
              : "กำลังคำนวณเวลา..."}
          </Text>
        </View>
      )}

      {uiState === "parked" && (
        <View style={styles.carWrap}>
          <Image
            source={require("../../assets/car top 1.png")}
            style={styles.carImage}
          />
        </View>
      )}
    </View>
  );

  const BottomButtons = () => (
    <View style={[styles.bottomRow, { gap: 12 }]}>
      <Pressable
        onPress={uiState === "parked" ? handleComplete : handleCancel}
        disabled={uiState === "idle"}
        style={[
          styles.filledBtn,
          { flex: 1, backgroundColor: uiState === "parked" ? GREEN : RED },
          uiState === "idle" && styles.filledDisabled,
        ]}
      >
        <Text style={styles.filledText}>{uiState === "parked" ? "ชำระเงิน" : "ยกเลิก"}</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        <Header />

        <Lot />

        {uiState !== "idle" && (
          <Text style={styles.locationLine}>
            {booking?.location ? `${booking.location}` : "ตำแหน่งที่จอง"}
            {booking?.floor ? ` • ชั้น ${booking.floor}` : ""}
            {booking?.pole ? ` • เสา ${booking.pole}` : ""}
          </Text>
        )}

        {uiState === "parked" && (
          <View style={{ width: "100%", paddingHorizontal: 20 }}>

            <Text style={styles.parkingSummary}>
              เวลาในการจอด: {fmtDuration(elapsedSec)}
              {"\n"}
              ประมาณการ: {feeEstimate.toFixed(2)} บาท
            </Text>

            <View style={{ marginTop: 15 }}>

              <Text
                style={{
                  fontWeight: "700",
                  marginBottom: 6
                }}
              >
                รหัสส่วนลด
              </Text>

              <TextInput
                value={discountCode}
                onChangeText={setDiscountCode}
                placeholder="PARK-XXXX"
                style={{
                  borderWidth: 1,
                  borderColor: "#ccc",
                  borderRadius: 10,
                  padding: 12
                }}
              />

              <Pressable
                onPress={handleApplyDiscount}
                style={{
                  marginTop: 10,
                  backgroundColor: ORANGE,
                  padding: 12,
                  borderRadius: 10,
                  alignItems: "center"
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontWeight: "700"
                  }}
                >
                  ใช้รหัส
                </Text>
              </Pressable>

            </View>
          </View>
        )}

        <BottomButtons />

      </ScrollView>

      <Modal visible={floorOpen} transparent animationType="slide" onRequestClose={() => setFloorOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>เลือกชั้น</Text>
            <FlatList
              data={floorsOfSelected}
              keyExtractor={(f) => String(f)}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.locItem} onPress={() => handleSelectFloor(item)}>
                  <Text style={styles.locName}>ชั้น {item}</Text>
                </TouchableOpacity>
              )}
            />
            <Pressable
              style={[styles.smallBtn, { alignSelf: "center", marginTop: 12, backgroundColor: GRAY }]}
              onPress={() => setFloorOpen(false)}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>ปิด</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={spaceOpen} transparent animationType="slide" onRequestClose={() => setSpaceOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>เลือกช่องจอด — ชั้น {selectedFloor}</Text>
            <FlatList
              data={spacesForFloor}
              keyExtractor={(s) => String(s.space_id)}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.locItem, { opacity: item.current_state === "available" ? 1 : 0.6 }]}
                  disabled={item.current_state !== "available"}
                  onPress={() => {
                    if (item.current_state !== "available") return;
                    setSelectedSpace(item);
                    setConfirmOpen(true);
                    setSpaceOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.locName}>ช่อง #{item.space_number}</Text>
                    <Text style={styles.locStatus}>
                      {item.zone_code ? `โซน ${item.zone_code} ` : ""}
                      {item.pole_label ? `• เสา ${item.pole_label} ` : ""}
                      • สถานะ:{" "}
                      <Text style={{ color: item.current_state === "available" ? GREEN : RED }}>
                        {item.current_state === "available" ? "ว่าง" : item.current_state}
                      </Text>
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.smallBtn,
                      { backgroundColor: item.current_state === "available" ? ORANGE : GRAY },
                    ]}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800" }}>
                      {item.current_state === "available" ? "เลือก" : "ปิด"}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
            <Pressable
              style={[styles.smallBtn, { alignSelf: "center", marginTop: 12, backgroundColor: GRAY }]}
              onPress={() => setSpaceOpen(false)}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>ปิด</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={selectOpen} transparent animationType="slide" onRequestClose={() => setSelectOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>เลือกสถานที่</Text>
            <FlatList
              data={locations}
              keyExtractor={(it) => it.id}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.locItem, { opacity: item.free ? 1 : 0.6 }]}
                  disabled={!item.free}
                  onPress={() => (item.free ? handleSelectLocation(item) : null)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.locName}>{item.name}</Text>
                    <Text style={styles.locStatus}>
                      สถานะ:{" "}
                      <Text style={{ color: item.free ? GREEN : RED }}>
                        {item.free ? "ว่าง" : "ไม่ว่าง"}
                      </Text>
                    </Text>
                  </View>
                  <View style={[styles.smallBtn, { backgroundColor: item.free ? ORANGE : GRAY }]}>
                    <Text style={{ color: "#fff", fontWeight: "800" }}>
                      {item.free ? "จอง" : "ปิด"}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
            <Pressable
              style={[styles.smallBtn, { alignSelf: "center", marginTop: 12, backgroundColor: GRAY }]}
              onPress={() => setSelectOpen(false)}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>ปิด</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.modalBgCenter}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>ยืนยันสิทธิ์การจองรถ</Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 18 }}>
              <Pressable
                style={[styles.confirmBtn, { borderColor: RED }]}
                onPress={() => setConfirmOpen(false)}
              >
                <Text style={[styles.confirmText, { color: RED }]}>ยกเลิก</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, { backgroundColor: ORANGE, borderColor: ORANGE }]}
                onPress={handleConfirm}
              >
                <Text style={[styles.confirmText, { color: "#fff" }]}>ยืนยัน</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fff"
  },

  scroll: {
    flex: 1
  },

  scrollContent: {
    alignItems: "center",
    paddingBottom: 120
  },
  topBar: { height: 88, backgroundColor: ORANGE, alignSelf: "stretch" },
  caption: { fontSize: 24, color: ORANGE, fontWeight: "700", marginTop: 10 },
  status: { fontSize: 36, marginTop: 6, fontWeight: "800" },
  subnote: { marginTop: 6, color: "#777", fontWeight: "600" },

  lotBox: {
    marginTop: 8,
    width: "90%",
    height: 410,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  hLineTop: { position: "absolute", top: 82, left: 0, right: 0, height: 3, backgroundColor: GRAY, borderRadius: 2 },
  hLineBottom: { position: "absolute", bottom: 46, left: 0, right: 0, height: 3, backgroundColor: GRAY, borderRadius: 2 },
  vLineLeft: { position: "absolute", top: 104, bottom: 66, left: "22%", width: 4, backgroundColor: GRAY, borderRadius: 2 },
  vLineRight: { position: "absolute", top: 104, bottom: 66, right: "22%", width: 4, backgroundColor: GRAY, borderRadius: 2 },

  bookArea: { alignItems: "center" },
  bookLabel: { color: ORANGE, fontSize: 22, fontWeight: "700", marginBottom: 10 },
  circle: { width: 110, height: 110, borderRadius: 55, borderWidth: 6, borderColor: ORANGE, alignItems: "center", justifyContent: "center" },
  plus: { color: ORANGE, fontSize: 58, fontWeight: "700", lineHeight: 62 },

  countdown: { marginTop: 6, color: "#666", fontWeight: "600" },
  centerCtaWrap: { alignItems: "center" },
  centerCta: { marginTop: 6, backgroundColor: ORANGE, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 22 },
  centerCtaDisabled: { backgroundColor: GRAY, opacity: 0.7 },
  centerCtaText: { color: "#fff", fontWeight: "800", fontSize: 18 },

  carWrap: { alignItems: "center", justifyContent: "center" },

  carImage: { width: 170, height: 280, resizeMode: "contain" },

  bottomRow: { width: "100%", flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingHorizontal: 16, marginBottom: 10 },
  outlineBtn: { flex: 1, borderWidth: 2, borderColor: ORANGE, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginRight: 8 },
  outlineText: { color: ORANGE, fontWeight: "700", fontSize: 16 },
  filledBtn: { flex: 1, backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 14, alignItems: "center", },
  filledText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  disabled: { borderColor: GRAY },
  disabledText: { color: GRAY },
  filledDisabled: { backgroundColor: "#D7D7D7" },

  locationLine: { marginTop: 8, color: "#444", fontWeight: "700", textAlign: "center", paddingHorizontal: 20 },

  parkingSummary: { marginTop: 6, color: "#444", fontWeight: "700", textAlign: "center", paddingHorizontal: 20, lineHeight: 24 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "72%" },
  sheetTitle: { fontSize: 22, fontWeight: "800", color: ORANGE, marginBottom: 10 },
  locItem: { flexDirection: "row", alignItems: "center", backgroundColor: "#f8f8f8", padding: 12, borderRadius: 12 },
  locName: { fontWeight: "800", fontSize: 16, marginBottom: 3 },
  locStatus: { color: "#666" },
  smallBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },

  modalBgCenter: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  confirmBox: { width: "82%", backgroundColor: "#fff", borderRadius: 16, padding: 18, alignItems: "center" },
  confirmTitle: { fontSize: 22, fontWeight: "800", color: ORANGE },
  confirmBtn: { flex: 1, borderWidth: 2, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18, alignItems: "center" },
  confirmText: { fontSize: 18, fontWeight: "800" },
});