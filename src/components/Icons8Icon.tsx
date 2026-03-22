import type { FC, CSSProperties } from 'react'

/* ── Icons8 Glyph Neue icon imports ── */
import sprout from '../../assets/icons8/sprout.png'
import fish from '../../assets/icons8/fish.png'
import deciduousTree from '../../assets/icons8/deciduous-tree.png'
import anchor from '../../assets/icons8/anchor.png'
import geography from '../../assets/icons8/geography.png'
import compass from '../../assets/icons8/compass.png'
import leaf from '../../assets/icons8/leaf.png'
import sea from '../../assets/icons8/sea.png'
import thermometer from '../../assets/icons8/thermometer.png'
import user from '../../assets/icons8/user.png'
import group from '../../assets/icons8/group.png'
import monument from '../../assets/icons8/monument.png'
import dashboard from '../../assets/icons8/dashboard.png'
import statistics from '../../assets/icons8/statistics.png'
import database from '../../assets/icons8/database.png'
import globe from '../../assets/icons8/globe.png'
import calendar from '../../assets/icons8/calendar.png'
import openedFolder from '../../assets/icons8/opened-folder.png'
import chat from '../../assets/icons8/chat.png'
import gear from '../../assets/icons8/gear.png'
import logoutRounded from '../../assets/icons8/logout-rounded.png'
import enter from '../../assets/icons8/enter.png'
import goal from '../../assets/icons8/goal.png'
import activity from '../../assets/icons8/activity.png'
import mapPin from '../../assets/icons8/map-pin.png'
import clock from '../../assets/icons8/clock.png'
import layers from '../../assets/icons8/layers.png'
import checkmark from '../../assets/icons8/checkmark.png'
import approval from '../../assets/icons8/approval.png'
import checked from '../../assets/icons8/checked.png'
import json from '../../assets/icons8/json.png'
import xls from '../../assets/icons8/xls.png'
import imageFile from '../../assets/icons8/image-file.png'
import pdf from '../../assets/icons8/pdf.png'
import csv from '../../assets/icons8/csv.png'
import fourSquares from '../../assets/icons8/four-squares.png'
import barChart from '../../assets/icons8/bar-chart.png'
import eventAccepted from '../../assets/icons8/event-accepted.png'
import hdd from '../../assets/icons8/hdd.png'
import bell from '../../assets/icons8/bell.png'
import phone from '../../assets/icons8/phone.png'
import phoneDisconnected from '../../assets/icons8/phone-disconnected.png'
import microphone from '../../assets/icons8/microphone.png'
import mute from '../../assets/icons8/mute.png'
import monitor from '../../assets/icons8/monitor.png'
import send from '../../assets/icons8/send.png'
import search from '../../assets/icons8/search.png'
import download from '../../assets/icons8/download.png'
import upload from '../../assets/icons8/upload.png'
import plus from '../../assets/icons8/plus.png'
import minus from '../../assets/icons8/minus.png'
import trash from '../../assets/icons8/trash.png'
import edit from '../../assets/icons8/edit.png'
import share from '../../assets/icons8/share.png'
import file from '../../assets/icons8/file.png'
import archive from '../../assets/icons8/archive.png'
import chevronLeft from '../../assets/icons8/chevron-left.png'
import chevronRight from '../../assets/icons8/chevron-right.png'
import back from '../../assets/icons8/back.png'
import key from '../../assets/icons8/key.png'
import info from '../../assets/icons8/info.png'
import camera from '../../assets/icons8/camera.png'
import save from '../../assets/icons8/save.png'
import briefcase from '../../assets/icons8/briefcase.png'
import mail from '../../assets/icons8/mail.png'
import paperclip from '../../assets/icons8/paperclip.png'
import expand from '../../assets/icons8/expand.png'
import checkAll from '../../assets/icons8/check-all.png'
import doubleTick from '../../assets/icons8/double-tick.png'
import videoCall from '../../assets/icons8/video-call.png'
import noVideo from '../../assets/icons8/no-video.png'
import noMicrophone from '../../assets/icons8/no-microphone.png'
import addUserMale from '../../assets/icons8/add-user-male.png'
import cancel from '../../assets/icons8/cancel.png'
import columns from '../../assets/icons8/columns.png'
import ok from '../../assets/icons8/ok.png'
import radio from '../../assets/icons8/radio.png'
import error from '../../assets/icons8/error.png'
import collapse from '../../assets/icons8/collapse.png'

/** Icon name → imported asset */
const ICON_MAP: Record<string, string> = {
  sprout,
  fish,
  'deciduous-tree': deciduousTree,
  anchor,
  geography,
  compass,
  leaf,
  sea,
  thermometer,
  user,
  group,
  monument,
  dashboard,
  statistics,
  database,
  globe,
  calendar,
  'opened-folder': openedFolder,
  chat,
  gear,
  'logout-rounded': logoutRounded,
  enter,
  goal,
  activity,
  'map-pin': mapPin,
  clock,
  layers,
  checkmark,
  approval,
  checked,
  json,
  xls,
  'image-file': imageFile,
  pdf,
  csv,
  'four-squares': fourSquares,
  'bar-chart': barChart,
  'event-accepted': eventAccepted,
  hdd,
  bell,
  phone,
  'phone-disconnected': phoneDisconnected,
  microphone,
  mute,
  monitor,
  send,
  search,
  download,
  upload,
  plus,
  minus,
  trash,
  edit,
  share,
  file,
  archive,
  'chevron-left': chevronLeft,
  'chevron-right': chevronRight,
  back,
  key,
  info,
  camera,
  save,
  briefcase,
  mail,
  paperclip,
  expand,
  'check-all': checkAll,
  'double-tick': doubleTick,
  'video-call': videoCall,
  'no-video': noVideo,
  'no-microphone': noMicrophone,
  'add-user-male': addUserMale,
  cancel,
  columns,
  ok,
  radio,
  error,
  collapse,
}

/**
 * Convert a hex color like #22c55e to a CSS brightness/sepia/hue-rotate filter
 * that tints a black icon to the target color.
 */
function hexToFilter(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  // Convert to HSL
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
    else if (max === gn) h = ((bn - rn) / d + 2) * 60
    else h = ((rn - gn) / d + 4) * 60
  }

  // Build a CSS filter approximation for tinting a black image
  const brightness = Math.max(l * 5, 0.5)
  const saturate = s * 8

  return `brightness(0) saturate(100%) invert(${Math.round(l * 100)}%) sepia(${Math.round(s * 100)}%) saturate(${Math.round(saturate * 100)}%) hue-rotate(${Math.round(h)}deg) brightness(${brightness.toFixed(2)})`
}

/** Pre-computed filter cache */
const filterCache = new Map<string, string>()
function getFilter(color?: string): string | undefined {
  if (!color) return undefined
  let f = filterCache.get(color)
  if (!f) {
    f = hexToFilter(color)
    filterCache.set(color, f)
  }
  return f
}

interface Icons8IconProps {
  /** Icon name from the Icons8 Glyph Neue set */
  name: string
  /** Size in pixels (default 20) */
  size?: number
  /** Hex color to tint the icon (e.g. "#22c55e") */
  color?: string
  /** Additional CSS class */
  className?: string
}

const Icons8Icon: FC<Icons8IconProps> = ({ name, size = 20, color, className }) => {
  const src = ICON_MAP[name]
  if (!src) {
    console.warn(`Icons8Icon: unknown icon "${name}"`)
    return null
  }

  const style: CSSProperties = {
    width: size,
    height: size,
    objectFit: 'contain',
    flexShrink: 0,
  }

  if (color) {
    style.filter = getFilter(color)
  }

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={className}
      style={style}
      draggable={false}
    />
  )
}

export default Icons8Icon
export { ICON_MAP }
