import { Experience } from './three/Experience'
import { ChapterIndex } from './ui/ChapterIndex'
import { Hud } from './ui/Hud'
import { Intro } from './ui/Intro'
import { Loader } from './ui/Loader'
import { Reader } from './ui/Reader'
import { useInteractions } from './ui/useInteractions'
import './ui/ui.css'

export default function App() {
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
