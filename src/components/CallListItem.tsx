import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, Phone, Ban, Play, Pause, Square } from 'lucide-react-native';
import { EnrichedCallRecord } from '../services/callLog';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { useColorScheme } from 'react-native';
import { format } from 'date-fns';
import { useAudioPlayer } from 'expo-audio';
import { useEvent } from 'expo';

interface CallListItemProps {
  call: EnrichedCallRecord;
  onPress: () => void;
}

// CallLog type constants based on Android docs
const CALL_TYPE = {
  INCOMING: 1,
  OUTGOING: 2,
  MISSED: 3,
  REJECTED: 5,
  BLOCKED: 6,
};

function AudioPlaybackButton({ url, colors }: { url: string; colors: any }) {
  const player = useAudioPlayer(url);
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  const togglePlayback = () => {
    if (isPlaying) {
      player.pause();
    } else {
      if (player.duration && player.currentTime >= player.duration) {
        player.seekTo(0);
      }
      player.play();
    }
  };

  const stopPlayback = () => {
    player.pause();
    player.seekTo(0);
  };

  return (
    <View style={styles.audioControls}>
      <TouchableOpacity style={styles.playButton} onPress={togglePlayback}>
        {isPlaying ? (
          <Pause color={colors.primary} size={20} />
        ) : (
          <Play color={colors.primary} size={20} />
        )}
      </TouchableOpacity>
      
      {(isPlaying || player.currentTime > 0) && (
        <TouchableOpacity style={styles.playButton} onPress={stopPlayback}>
          <Square color={colors.primary} size={20} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function CallListItem({ call, onPress }: CallListItemProps) {
  const { theme: storedTheme, showDuration } = useAppStore();
  const systemTheme = useColorScheme();
  const isDark = storedTheme === 'system' ? systemTheme === 'dark' : storedTheme === 'dark';
  const colors = isDark ? DarkTheme.colors : LightTheme.colors;

  const getCallIcon = () => {
    switch (call.type) {
      case CALL_TYPE.INCOMING: return <PhoneIncoming color={colors.incoming} size={18} />;
      case CALL_TYPE.OUTGOING: return <PhoneOutgoing color={colors.outgoing} size={18} />;
      case CALL_TYPE.MISSED: return <PhoneMissed color={colors.missed} size={18} />;
      case CALL_TYPE.REJECTED: return <PhoneMissed color={colors.rejected} size={18} />; // Android treats rejected similar to missed sometimes
      case CALL_TYPE.BLOCKED: return <Ban color={colors.blocked} size={18} />;
      default: return <Phone color={colors.textMuted} size={18} />;
    }
  };

  const getCallTypeLabel = () => {
    switch (call.type) {
      case CALL_TYPE.INCOMING: return 'Incoming';
      case CALL_TYPE.OUTGOING: return 'Outgoing';
      case CALL_TYPE.MISSED: return 'Missed';
      case CALL_TYPE.REJECTED: return 'Rejected';
      case CALL_TYPE.BLOCKED: return 'Blocked';
      default: return 'Unknown';
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const timeString = call.timestamp ? format(new Date(call.timestamp), 'hh:mm a') : 'Unknown';

  return (
    <TouchableOpacity 
      style={[styles.container, { backgroundColor: colors.card, borderBottomColor: colors.border }]} 
      onPress={onPress}
    >
      <View style={[styles.avatar, { backgroundColor: colors.border }]}>
        <Text style={[styles.avatarText, { color: colors.text }]}>
          {call.contactName ? call.contactName.charAt(0).toUpperCase() : '?'}
        </Text>
      </View>
      <View style={styles.details}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {call.contactName || call.number || 'Unknown Number'}
        </Text>
        <View style={styles.subTitleRow}>
          {getCallIcon()}
          <Text style={[styles.typeText, { color: colors.textMuted }]}>
            {getCallTypeLabel()} {call.tag ? `• ${call.tag}` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.meta}>
        <Text style={[styles.time, { color: colors.textMuted }]}>{timeString}</Text>
        {showDuration && call.duration !== null && call.duration > 0 && (
          <Text style={[styles.duration, { color: colors.textMuted }]}>{formatDuration(call.duration)}</Text>
        )}
      </View>
      
      {Boolean(call.recordingPath) && (
        <AudioPlaybackButton url={call.recordingPath as string} colors={colors} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  details: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  subTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeText: {
    fontSize: 14,
    marginLeft: 6,
  },
  meta: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  time: {
    fontSize: 13,
    fontWeight: '500',
  },
  duration: {
    fontSize: 12,
    marginTop: 4,
  },
  playButton: {
    marginLeft: 8,
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  audioControls: {
    flexDirection: 'row',
    alignItems: 'center',
  }
});
