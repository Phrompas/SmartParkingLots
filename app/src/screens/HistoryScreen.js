import React, { useEffect, useState, useCallback } from 'react';
import { SafeAreaView, View, Text, FlatList, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import dayjs from 'dayjs';
import api from '../api';

const ORANGE = '#D38C28';
const RED = '#E35545';
const GREEN = '#16a34a';
const GRAY = '#9CA3AF';
const BG = '#FFFFFF';

export default function HistoryScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async (mode = 'load') => {
    try {
      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const { data } = await api.get('/bookings/history');
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[History] fetch error', err);
      if (mode === 'refresh') {
        setRefreshing(false);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory('load');
  }, [fetchHistory]);

  const statusLabel = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'completed') return 'เสร็จสิ้น';
    if (s === 'cancelled') return 'ยกเลิก';
    if (s === 'checked-in') return 'กำลังจอด';
    if (s === 'reserved') return 'จองไว้';
    return status || '-';
  };

  const fmtDateTime = (value, fallback = '-') => {
    if (!value) return fallback;
    const d = dayjs(value);
    return d.isValid() ? d.format('DD/MM/YYYY HH:mm') : fallback;
  };

  const renderItem = ({ item }) => {
    const start = fmtDateTime(item.start_time);
    const end = fmtDateTime(item.checked_out_at);
    const color = item.status === 'completed' ? GREEN : item.status === 'cancelled' ? RED : ORANGE;
    const place = [item.location_name, item.space_number].filter(Boolean).join(' • ') || 'ไม่ระบุช่องจอด';
    const feeText = `${Number(item.total_fee || 0).toFixed(2)} ฿`;

    return (
      <View style={styles.card}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{place}</Text>
          <Text style={styles.sub}>เริ่มจอด: {start}</Text>
          <Text style={styles.sub}>สิ้นสุด: {end}</Text>
          <Text style={styles.sub}>สถานะ: <Text style={{ color, fontWeight: '800' }}>{statusLabel(item.status)}</Text></Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.fee}>{feeText}</Text>
          {item.deposit_amount > 0 && (
            <Text style={styles.deposit}>มัดจำ {Number(item.deposit_amount).toFixed(2)} ฿ • {item.deposit_status || '-'}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <View style={styles.header}>
        <Text style={styles.headerText}>ประวัติการจอดและการชำระเงิน</Text>
        <Text style={styles.headerSub}>ดูรายการย้อนหลังและยอดชำระของคุณ</Text>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it.reservation_id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchHistory('refresh')} colors={[ORANGE]} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>ยังไม่มีประวัติ</Text>
              <Text style={styles.emptySub}>เมื่อคุณมีการจอดหรือชำระเงิน รายการจะมาแสดงที่หน้านี้</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 96,
    backgroundColor: ORANGE,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  headerText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  headerSub: { color: '#FFF7ED', marginTop: 4 },
  card: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  title: { fontWeight: '800', color: '#1F2937' },
  sub: { color: '#6B7280', marginTop: 3 },
  fee: { fontWeight: '900', color: '#111827', fontSize: 15 },
  deposit: { color: '#6B7280', fontSize: 12, marginTop: 4, textAlign: 'right' },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: 24,
  },
  emptyTitle: { color: '#111827', fontWeight: '800', fontSize: 16 },
  emptySub: { color: GRAY, marginTop: 6, textAlign: 'center', lineHeight: 20 },
});
