import { useState } from 'react'
import { isPhone } from './store/useBook'
import { Experience } from './three/Experience'
import { ChapterIndex } from './ui/ChapterIndex'
import { Hud } from './ui/Hud'
import { Intro } from './ui/Intro'
import { Loader } from './ui/Loader'
import { MobileEdition } from './ui/MobileEdition'
import { Reader } from './ui/Reader'
import { useInteractions } from './ui/useInteractions'
import './ui/ui.css'

/** the floating 3D book: tablets, laptops and up */
function DesktopEdition() {
  useInteractions()
  return (
    <>
      <Experience />
      <Hud />
      <Intro />
      <ChapterIndex />
      <Reader />
      <Loader />
    </>
  )
}

export default function App() {
  // decided once at start-up: a phone never mounts WebGL at all
  const [phone] = useState(isPhone)
  if (phone) {
    return (
      <>
        <MobileEdition />
        <Reader />
      </>
    )
  }
  return <DesktopEdition />
}
