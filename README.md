# paim-reel

ทำคลิปการเงินแนวตั้ง 9:16 สไตล์ P.AIM จากหัวข้อ หรือจากเสียงที่อัดเอง · A skill for Claude Code and Codex that turns a finance topic, or your own voice recording, into a 9:16 explainer reel in the P.AIM brand.

![Preview of an example reel](docs/preview.gif)

ภาษาไทยอยู่ก่อน ภาษาอังกฤษอยู่ด้านล่าง เนื้อหาเหมือนกัน · Thai first, English below, same content.

---

## ทำอะไรได้

`paim-reel` เป็นสกิลสำหรับ Claude Code และ Codex CLI ใช้ทำคลิปสั้นอธิบายเรื่องการเงินในแบบ P.AIM

- ได้ไฟล์ MP4 แนวตั้ง 1080×1920 ที่ 30 เฟรมต่อวินาที (H.264 และ AAC) พร้อมไฟล์เล็กไว้เปิดดูเร็ว ๆ
- แบรนด์คงที่: ส้ม เขียว เทาถ่าน ครีม ตัวอักษร Sukhumvit Set
- พื้นหลังเป็นกระดาษทำมือ ขอบกระดาษฉีก
- สติกเกอร์ที่โปรแกรมช่วยวาดภาพวาดให้ทุกคลิป ภาพถ่ายจากเว็บที่แสดงเป็นการ์ดกระดาษฉีก และบันทึกเครดิตของทุกภาพ
- เสียงเอฟเฟกต์เบา ๆ ที่สร้างขึ้นเอง เสียงพูดจะดังกว่าเสมอ
- คำบรรยายภาษาไทยทีละวลี ตรงกับเสียงที่อัด
- ด่านตรวจอัตโนมัติก่อนเรนเดอร์ (ตัวหนังสืออยู่ในพื้นที่ปลอดภัย ไม่มีช่วงนิ่งนาน ภาพไม่ทับคำบรรยาย ภาพถ่ายทุกภาพมีเครดิต)
- ตั้งค่าครั้งแรกเป็นภาษาไทย ทีละคำถาม
- ส่งคลิปที่เสร็จแล้วต่อให้ OpenFilm Studio เพื่อแก้เองด้วยมือ

เสียงพูดเป็นเสียงของพี่เอมเองเท่านั้น ไม่มีเสียงสังเคราะห์และไม่โคลนเสียง

มี 2 วิธีเริ่ม:

- **จากหัวข้อ:** ผู้ช่วยเขียนบท ตรวจตัวเลขกับเว็บ แล้วทำคลิปร่างที่มีเสียงเอฟเฟกต์แต่ยังไม่มีเสียงพูด พร้อมบทสำหรับอ่านออกเสียง พี่เอมอัดเสียงแล้วส่งกลับมา
- **จากเสียงอัด:** ผู้ช่วยถอดเสียงในเครื่อง จัดเวลาคำบรรยายให้ตรงเสียง แล้วเรนเดอร์คลิปจริง

## ต้องมีอะไรบ้าง

- Mac ที่ใช้ทดสอบคือ Mac ชิป Apple (macOS) ระบบอื่นยังไม่ได้ทดสอบ ส่วน Windows ยังไม่ได้ลองเลย
- Node 20 ขึ้นไป (ถ้าจะเปิด OpenFilm Studio ต้อง Node 22.2 ขึ้นไป)
- Python 3.10 ถึง 3.12 (faster-whisper ยังไม่มีตัวติดตั้งสำหรับรุ่นใหม่กว่านี้) หรือติดตั้ง `uv` ไว้ก่อน
- ffmpeg และ ffprobe
- พื้นที่ว่างประมาณ 1 GB สำหรับแพ็กเกจและ Chromium และอีกประมาณ 3 GB สำหรับโมเดลถอดเสียง ที่จะดาวน์โหลดตอนถอดเสียงครั้งแรก
- `fetch_photo.py` (ตัวดึงรูปถ่ายจากเว็บ) ใช้ได้บน macOS หรือ Linux
- **ใต้ Claude Code ต้องมีโปรแกรมช่วยวาดภาพ** เพราะ Claude วาดภาพเองไม่ได้ สกิลจะไม่เริ่มทำคลิปถ้ายังไม่เลือก ไม่ถอยไปใช้ไอคอนเงียบ ๆ
  - ทางที่ทดสอบแล้วและแนะนำคือ **Codex CLI** (ใช้บัญชี ChatGPT)
  - บัญชี Google ส่วนตัว ใช้ได้ผ่าน **Antigravity CLI** (`agy`) ที่ตั้งเป็น `image_cmd` ตอนทดลองวาดได้ แต่สติกเกอร์ยังไม่เรียบร้อยเท่า Codex
  - **Gemini CLI** ตัวเดิมใช้ได้เฉพาะบัญชีของที่ทำงานที่องค์กรจ่ายเงินให้ หรือคนที่มี API key อยู่แล้ว (ตัว Gemini CLI เองปฏิเสธบัญชี Google ส่วนตัวแบบฟรี)
- ใต้ Codex ไม่ต้องเลือกอะไร Codex วาดภาพเอง

## ติดตั้ง

เอา repository นี้มาไว้ในเครื่อง (clone หรือดาวน์โหลด) แล้วเปิด Terminal ในโฟลเดอร์นั้น

```
./install.sh
```

คำสั่งนี้ติดตั้งแพ็กเกจ Node, Chromium ของ Playwright และ Python virtual environment แล้วลิงก์สกิลเข้าโฟลเดอร์ของทั้ง Claude Code และ Codex

ถ้าใช้แค่ตัวใดตัวหนึ่ง:

```
./install.sh --claude    # ลิงก์ไปที่ ~/.claude/skills/paim-reel
./install.sh --codex     # ลิงก์ไปที่ ~/.codex/skills/paim-reel
./install.sh --check     # ไม่ติดตั้งอะไร แค่ตรวจว่าเครื่องพร้อมไหม
```

ตรวจเครื่องเองได้ตลอดด้วย `skills/paim-reel/scripts/doctor.sh --agent claude` (หรือ `--agent codex`) มันพิมพ์ `ok …` หรือ `MISSING …` ทีละบรรทัด

หมายเหตุ: การติดตั้งใน Codex ยังไม่ได้ทดสอบจนจบ ทดสอบแค่ว่าลิงก์ถูกสร้างในโฟลเดอร์ชั่วคราว ยังไม่ได้เปิด Codex เพื่อดูว่าเห็นสกิลหรือไม่

## ตั้งค่าครั้งแรก

ครั้งแรกที่ใช้ ผู้ช่วยจะพาตั้งค่าเป็นภาษาไทยก่อนทำงานอื่น ใช้เวลาประมาณสิบนาที ไม่รวมเวลาทำคลิปตัวอย่าง ถามทีละคำถาม และเก็บทุกคำตอบทันที ถ้าหยุดกลางคัน ก็ทำต่อจากจุดเดิมได้ มีลำดับดังนี้

1. ทักทาย บอกว่าทำอะไรได้และต้องใช้อะไร
2. ตรวจเครื่อง ถ้าขาดอะไร จะอธิบายและติดตั้งหลังจากได้รับคำตอบว่าตกลงเท่านั้น
3. (เฉพาะ Claude Code) เลือกโปรแกรมช่วยวาดภาพ ติดตั้ง แล้วให้พี่เอมเข้าสู่ระบบเองในหน้าต่าง Terminal จากนั้นวาดสติกเกอร์ทดสอบหนึ่งภาพ
4. ข้อมูลช่อง: ชื่อช่อง (handle) โลโก้ (ไม่บังคับ) ข้อความเตือนท้ายคลิป (ไม่บังคับ) กลุ่มคนดู น้ำเสียง และโฟลเดอร์เก็บคลิป
5. ทำคลิปตัวอย่างหนึ่งคลิปให้ดู
6. เล่าเรื่องที่ควรรู้ (เสียงเอฟเฟกต์ รูปถ่ายจากเว็บ และ Studio) แล้วส่งคู่มือย่อภาษาไทย ที่ `skills/paim-reel/references/cheatsheet-th.md`

ผู้ช่วยไม่เคยขอรหัสผ่าน API key หรือรหัสเข้าสู่ระบบ และไม่เก็บสิ่งเหล่านี้ พี่เอมพิมพ์เองในหน้าต่างที่เปิดขึ้นมา

ตั้งค่าใหม่ภายหลังได้ด้วยการพิมพ์ "ตั้งค่าใหม่" ผู้ช่วยจะถามว่าจะเปลี่ยนส่วนไหน การตั้งค่าเก็บไว้ที่ `~/.config/paim-reel/profile.json` (เปลี่ยนที่เก็บได้ด้วยตัวแปร `PAIM_CONFIG_DIR`) นอก repository

## ทำคลิปแรก

พิมพ์ประโยคเดียวใน Claude Code หรือ Codex:

- จากหัวข้อ: `ทำ reel เรื่อง ดอกเบี้ยทบต้น`
- จากเสียง: `ทำคลิปจากเสียงนี้` แล้วแนบไฟล์เสียง (เช่น .m4a จาก Voice Memos)

ถ้าส่งเสียงมาโดยไม่มีบท ผู้ช่วยฟังเสียงเองไม่ได้ จึงเขียนข้อความที่ถอดได้ลงไฟล์ `script.proposed.md` แล้วหยุดรอให้พี่เอมตรวจทีละบรรทัด คำที่อ่านไม่ออกจะเป็น `[?]` ไม่เดา ผู้ช่วยจะไม่จัดเวลาจนกว่าพี่เอมจะยืนยัน

ผลงานอยู่ในโฟลเดอร์ของคลิปนั้น ในโฟลเดอร์ `renders/`: `<ชื่อ>.mp4` (ฉบับเต็ม) `<ชื่อ>-preview.mp4` (720×1280) คลิปร่างจะลงท้ายว่า `-draft` และถ้ามีรูปถ่ายจากเว็บ จะมี `<ชื่อ>-credits.md` ด้วย

ตัวอย่างที่แถมมา (ETF เทียบกับหุ้นรายตัว) อยู่ที่ `skills/paim-reel/examples/etf-vs-stock/` ใช้ดูรูปแบบไฟล์ได้ ผู้ช่วยไม่ใช้เป็นแหล่งของสิ่งที่พี่เอมพูดหรือของข้อเท็จจริง

เวลาเรนเดอร์ที่วัดได้: คลิปร่างตัวอย่างยาว 36 วินาที พร้อมไฟล์ preview ใช้เวลาประมาณ 48 วินาที บน Mac ชิป Apple (Apple M1 Pro) ถ้าเครื่องกำลังทำอย่างอื่นอยู่ อาจนานกว่านี้หลายเท่า

## อะไรอยู่ในเครื่อง อะไรออกไปข้างนอก

- ไฟล์เสียงของพี่เอม และการถอดเสียงเป็นข้อความ ทำอยู่ในเครื่องนี้ ไม่ส่งไฟล์เสียงออกไป (โมเดลถอดเสียงดาวน์โหลดครั้งเดียวตอนใช้ครั้งแรก)
- ผู้ช่วยที่พี่เอมคุยด้วยในแชต (Claude Code หรือ Codex) อ่านข้อความของบทและข้อความที่ถอดจากเสียง
- โปรแกรมช่วยวาดภาพได้รับแค่คำบรรยายสั้น ๆ ของวัตถุที่จะวาด เช่น "ตะกร้าใส่เหรียญ"
- ตอนตรวจตัวเลขและหารูปถ่าย ผู้ช่วยค้นเว็บ คำค้นและการดาวน์โหลดรูปออกไปข้างนอก แต่ไม่มีไฟล์ของโปรเจกต์ถูกอัปโหลด
- สกิลไม่ขอและไม่เก็บรหัสผ่านหรือ API key

## รูปถ่ายจากเว็บ

ของจริงที่มีชื่อเรียก เช่น ตึก ธนบัตร สถานที่ จะใช้รูปถ่ายจากเว็บ ส่วนความคิด เช่น ความเสี่ยง การเติบโต จะใช้สติกเกอร์

เจ้าของโปรเจกต์เลือกให้ค้นรูปจากเว็บทั่วไป ทั้งที่รู้ว่ารูปบนเว็บส่วนใหญ่มีลิขสิทธิ์ ดังนั้น:

- ทุกรูปบันทึกใน `gen/photos/credits.json` ของโปรเจกต์: ที่อยู่รูป หน้าเว็บที่มา ข้อความสัญญาอนุญาตที่หน้านั้นระบุ (หรือ `unknown`) และเครดิต
- รูปที่หน้าเว็บไม่ระบุสัญญาอนุญาตจะถูกบันทึกว่า `unknown` รูปแบบนี้อาจติดลิขสิทธิ์ ผู้ใช้เป็นคนตัดสินใจเองว่าจะใช้หรือไม่ ผู้ช่วยจะแจ้งรูปเหล่านี้ทุกครั้งตอนส่งงาน พร้อมไฟล์เครดิต
- รูปถ่ายอยู่ในโฟลเดอร์โปรเจกต์เท่านั้น ไม่เข้ามาใน repository
- ตัวดึงรูปรับเฉพาะ HTTPS และไฟล์ JPEG PNG หรือ WebP ถอดรหัสแล้วบันทึกใหม่ ไม่รันอะไรจากไฟล์ที่ดาวน์โหลด และไม่รับ SVG
- รูปเดียวที่แถมใน repository คือ "Wicker Basket Containing Clay Coins" ของ Gary Todd เผยแพร่เป็น CC0 ที่มาอยู่ใน `THIRD_PARTY_NOTICES.md`

## แก้ต่อใน OpenFilm Studio

คลิปที่เสร็จแล้ว (ที่มีเสียงพี่เอมแล้ว) ส่งต่อเป็นโปรเจกต์ OpenFilm เพื่อเปิดใน OpenFilm Studio แล้วแก้ด้วยมือได้ ตัวเรนเดอร์ของสกิลยังเป็นตัวทำไฟล์ MP4 เหมือนเดิม

- คลิปร่างยังเปิดแก้ไม่ได้
- ครั้งแรกที่เปิด Studio บนเครื่องนี้ อาจดาวน์โหลดประมาณ 100 MB ผู้ช่วยจะถามก่อน Studio ต้องใช้ Node 22.2 ขึ้นไป
- Studio เป็นของผู้ใช้ ผู้ช่วยไม่ปิดและไม่เปิดใหม่ให้ ผู้ใช้ปิดเอง ที่อยู่ของ Studio มีรหัสชั่วคราวอยู่ในนั้น ผู้ช่วยให้ครั้งเดียวในแชตและไม่เขียนลงไฟล์ใด ๆ
- การส่งออกไม่ใช้เครือข่าย ฟีเจอร์ออนไลน์ของ Studio (สร้างเสียง เพลง รูป) ไม่ถูกใช้
- สิ่งที่แก้ใน Studio อยู่ในโฟลเดอร์ `openfilm/` เท่านั้น ไม่เปลี่ยน `story.json` และไม่เปลี่ยนไฟล์ MP4 ที่สกิลทำไว้ คลิปที่แก้เองต้องส่งออกจาก Studio เอง และไฟล์นั้นไม่ผ่านการตรวจความดังเสียงของสกิลอีกรอบ
- รายละเอียดที่ทดลองแล้วและที่ยังไม่ได้ทดลอง อยู่ที่ `skills/paim-reel/references/openfilm.md`

## เปลี่ยนแบรนด์

ค่าแบรนด์อยู่ที่ `skills/paim-reel/brand.json`

- `colors`: สี 4 ค่า (`orange`, `green`, `charcoal`, `cream`) เป็นรหัส `#RRGGBB` สีตัวหนังสือถูกกำหนดตามบทบาทของสี (เทาถ่านบนครีม เทาถ่านบนส้ม ครีมบนเทาถ่าน ครีมบนเขียว) จึงต้องเลือกสีใหม่ที่ยังตัดกันพอ ไม่มีส่วนไหนวัดความตัดกันของสีใหม่ให้
- `handle`, `logo`, `disclaimer`: ค่าตั้งต้นของท้ายคลิป ค่าที่ตั้งตอนตั้งค่าครั้งแรกจะมาก่อน (ดูหรือแก้ด้วย `node skills/paim-reel/scripts/profile.mjs show` และ `set`)
- `fonts`: ถูกตรวจรูปแบบ แต่ตัวอักษรที่ใช้วาดจริงถูกกำหนดใน `skills/paim-reel/engine/style.css` และ `skills/paim-reel/engine/runtime.mjs`
- สติกเกอร์ถูกวาดด้วยสีทั้งสี่เช่นกัน คำสั่งวาดใน `skills/paim-reel/scripts/image_cli.py` และการตรวจพาเลตใน `skills/paim-reel/scripts/key_sprite.py` ระบุสีเหล่านั้นไว้ ถ้าเปลี่ยนสีต้องแก้สองไฟล์นี้ด้วย
- กฎของแบรนด์ทั้งหมดอยู่ที่ `skills/paim-reel/references/brand.md`

## ตัวอักษร

Sukhumvit Set มากับ macOS และใช้เมื่อมีอยู่ในเครื่อง repository นี้ไม่มีและไม่คัดลอกไฟล์ฟอนต์ของมัน เพราะแจกจ่ายต่อไม่ได้ ถ้าเครื่องไม่มี สกิลจะใช้ IBM Plex Sans Thai (OFL-1.1) ที่ติดตั้งจาก npm และบอกไว้ในรายงานตอนส่งงานว่าใช้ตัวไหน

## สถานะ: อะไรทดสอบแล้ว อะไรยังไม่ได้ทดสอบ

นี่คือเวอร์ชัน 1 ผลการทดสอบด้านล่างวัดบน Mac ชิป Apple (Apple M1 Pro, macOS 15, Node 22, Python 3.12)

**ทดสอบแล้ว**

- ชุดทดสอบอัตโนมัติ: Node 291 รายการผ่าน (ข้าม 1 รายการที่ต้องใช้เครือข่ายและ OpenFilm จริง) และ Python 178 รายการผ่าน (ข้าม 2 รายการที่ต้องเลือกเปิดเอง: เรียกโปรแกรมวาดภาพจริง และโมเดลถอดเสียงจริง) ผ่านทั้งหมด ชุดทดสอบไม่เรียกโปรแกรมวาดภาพจริง ไฟล์เสียงที่ใช้ทดสอบทั้งหมดเป็นเสียงสังเคราะห์
- ผู้ช่วยใหม่ที่ได้รับแค่สกิลนี้ ทำคลิปจากไฟล์เสียงจนจบหนึ่งคลิปได้ รวมขั้นตอนหยุดให้ผู้ใช้ตรวจบท การรันล่าสุดครอบคลุมเสียงเอฟเฟกต์และการส่งต่อไป Studio ด้วย
- ผู้ช่วยใหม่ทำคลิปจากหัวข้อได้ถึงคลิปร่างและบทสำหรับอ่านออกเสียง การรันล่าสุดค้นและดาวน์โหลดรูปจากเว็บจริงสองรูป บันทึกที่มาและสัญญาอนุญาตจากหน้าเว็บ และสร้างไฟล์บอกที่มาของรูป รูปสติกเกอร์ในการรันทั้งสองแบบใช้โปรแกรมวาดภาพจำลอง

**ยังไม่ได้ทดสอบ**

- การตั้งค่าครั้งแรกกับผู้ใช้จริงหรือผู้ใช้จำลอง (ข้อความและคำสั่งเบื้องหลังมีชุดทดสอบ แต่ยังไม่เคยมีใครเดินตามบทสนทนานี้จริง)
- เสียงมนุษย์จริง ๆ ไฟล์เสียงทดสอบทุกไฟล์เป็นเสียงสังเคราะห์
- เสียงของเอฟเฟกต์ทั้งหกตัวฟังแล้วเป็นอย่างไร ยังไม่มีใครฟัง (วัดความยาวและระดับเสียงแล้ว แต่ไม่ได้ฟัง)
- โมเดลถอดเสียงตั้งต้น `large-v3` การทดสอบใช้รุ่น `small` และ `tiny`
- การติดตั้งใน Codex จนจบ (ทดสอบแค่ลิงก์ในโฟลเดอร์ชั่วคราว)
- Windows

รายการปัญหาที่รู้อยู่แล้ว และเรื่องเล็กที่ยังไม่ได้แก้ อยู่ที่ [`docs/known-issues.md`](docs/known-issues.md) ก่อนโพสต์คลิป ให้เปิดฟังเสียงในคลิปหนึ่งรอบเสมอ เพราะผู้ช่วยฟังเสียงเองไม่ได้

## ยังไม่มีในเวอร์ชัน 1

เสียงสังเคราะห์หรือเสียงโคลน (ใช้เฉพาะเสียงที่พี่เอมอัดเอง) · พื้นหลังหรือฉากทั้งฉากที่ AI สร้าง · วิดีโอที่ AI สร้าง · สไตล์คอลลาจตัดแปะ · เพลงประกอบที่แถมมา (ใช้ไฟล์เพลงของผู้ใช้ได้ที่ระดับเบาคงที่) · การตัดคำติดอ่างหรือเริ่มพูดใหม่ออกจากเสียงอัด · วิดีโอแนวนอน · ปลั๊กอินสำหรับ Claude Code · การทดสอบบน Windows · การส่งคลิปร่างไปแก้ใน OpenFilm Studio

เนื้อหาเป็นเชิงให้ความรู้เท่านั้น ไม่สัญญาผลตอบแทน ไม่ให้คำแนะนำลงทุนรายบุคคล และตัวเลขทุกตัวบนจอต้องมีแหล่งที่มา

## สัญญาอนุญาต

MIT ดูที่ `LICENSE` ส่วนประกอบและไฟล์ของบุคคลที่สามอยู่ที่ `THIRD_PARTY_NOTICES.md`

---

## What it makes

`paim-reel` is a skill for Claude Code and Codex CLI that makes short finance explainer reels in the P.AIM style.

- A vertical MP4, 1080×1920 at 30 fps (H.264 and AAC), plus a small preview file.
- A fixed brand: orange, green, charcoal, cream, and the Sukhumvit Set typeface.
- A handmade-paper look: paper background, torn paper edges.
- Sticker sprites drawn by the image tool for each reel, web photos shown as torn paper cards with a recorded credit for every photo.
- Soft sound effects generated by this project; the voice is always louder.
- Thai captions, one phrase at a time, timed to the recorded voice.
- An automatic review gate before rendering (text inside the safe area, no long dead stretches, nothing covering a caption, every photo credited).
- A guided first-run setup, in Thai, one question at a time.
- A hand-off of the finished reel to OpenFilm Studio so it can be edited by hand.

The voice is always the user's own recording. There is no text-to-speech and no cloned voice.

Two ways to start:

- **From a topic:** the assistant writes the script, checks the figures on the web, and makes a draft reel with sound effects and no voice yet, together with a read-aloud sheet. You record it and send it back.
- **From a recording:** the assistant transcribes it on this machine, times the captions to it, and renders the finished reel.

## Requirements

- The tested machine is an Apple-silicon Mac (macOS). Other systems are untested; Windows has not been tried at all.
- Node 20 or newer (22.2 or newer to open OpenFilm Studio).
- Python 3.10 to 3.12 (faster-whisper has no installers beyond that), or `uv` installed first.
- ffmpeg and ffprobe.
- About 1 GB of free disk for packages and Chromium, and about 3 GB more for the speech model, downloaded the first time a recording is transcribed.
- `fetch_photo.py`, the web photo fetcher, runs on macOS or Linux.
- **Under Claude Code an image tool is required**, because Claude cannot draw. The skill will not start a reel without one, and it does not fall back to icons silently.
  - The tested and recommended route is the **Codex CLI** (a ChatGPT account).
  - A personal Google account works only through the **Antigravity CLI** (`agy`) set as `image_cmd`. It drew in the test, but its stickers are less tidy than Codex's.
  - The plain **Gemini CLI** works only for a work account whose organisation pays for it, or for someone who already has an API key (the Gemini CLI itself refuses free personal Google accounts).
- Under Codex nothing is chosen: Codex draws the pictures itself.

## Install

Get this repository onto your machine (clone or download) and open a terminal in its folder.

```
./install.sh
```

This installs the Node packages, Playwright's Chromium and a Python virtual environment, then links the skill into both Claude Code's and Codex's skill folders.

To use only one of them:

```
./install.sh --claude    # links ~/.claude/skills/paim-reel
./install.sh --codex     # links ~/.codex/skills/paim-reel
./install.sh --check     # installs nothing, only checks that the machine is ready
```

You can check the machine at any time with `skills/paim-reel/scripts/doctor.sh --agent claude` (or `--agent codex`). It prints `ok …` or `MISSING …`, one line each.

Note: the Codex install has not been tested end to end. Only the link is tested, under a temporary home folder; Codex itself was not started to see whether it lists the skill.

## First-run setup

The first time you use it, the assistant runs a guided setup in Thai before any reel work. It takes about ten minutes, not counting the time to render the sample. It asks one question at a time and saves each answer at once, so an interrupted setup resumes where it stopped. In order:

1. A welcome: what the skill makes and what it needs.
2. A machine check. If something is missing it explains it and installs it only after a yes.
3. (Claude Code only) Choose the image tool, install it, let the user sign in herself in a Terminal window, then draw one test sticker.
4. Channel details: the channel handle, a logo (optional), a short disclaimer for the end card (optional), the audience, the tone, and the folder where reels are kept.
5. One sample reel, so a result is visible.
6. Three things worth knowing (sound effects, web photos, Studio), then a one-page Thai cheat sheet, `skills/paim-reel/references/cheatsheet-th.md`.

The assistant never asks for a password, API key or login code, and never stores one. You type those yourself in the window that opens.

To set up again later, say "ตั้งค่าใหม่" ("set up again"); it asks which part to change. The settings live in `~/.config/paim-reel/profile.json` (move it with the `PAIM_CONFIG_DIR` variable), outside the repository.

## Your first reel

Type one sentence in Claude Code or Codex:

- From a topic: `ทำ reel เรื่อง ดอกเบี้ยทบต้น` ("make a reel about compound interest")
- From a voice recording: `ทำคลิปจากเสียงนี้` ("make a clip from this voice") with the audio file attached (for example a .m4a from Voice Memos)

If a recording comes without a script, the assistant cannot hear it. It writes what the recogniser heard into `script.proposed.md` and stops, so you can check it line by line. A word it cannot read is written `[?]`, never guessed. Nothing is timed until you confirm.

Results are in the reel's own folder, under `renders/`: `<slug>.mp4` (the full reel), `<slug>-preview.mp4` (720×1280). A draft ends in `-draft`, and when web photos are used there is also `<slug>-credits.md`.

A bundled example (ETF versus a single stock) is in `skills/paim-reel/examples/etf-vs-stock/`. It shows the file formats; the assistant never uses it as a source for what you said or for facts.

Measured render time: the 36-second example draft, with its preview, took about 48 seconds on an Apple-silicon Mac (Apple M1 Pro). It can take many times longer when the machine is busy with other work.

## What stays on your machine and what goes out

- The voice file and its speech-to-text stay on this machine. (The speech model is downloaded once, the first time it is used.)
- The assistant you chat with (Claude Code or Codex) reads the script text and the transcript text.
- The image tool receives only short descriptions of the objects to draw, such as "a basket of coins".
- When checking figures and finding photos, the assistant searches the web. Search words and photo downloads go out; no file from the project is uploaded.
- The skill never asks for or stores a password or API key.

## Web photos

A real, nameable thing (a building, a banknote, a place) is shown with a web photo. An idea (risk, growth) is shown with a sticker.

The owner chose general web image search, knowing that most web images are copyrighted. So:

- Every photo is recorded in the project's `gen/photos/credits.json`: image address, source page, the licence text that page states (or `unknown`), and the credit.
- A photo whose page states no licence is recorded as `unknown`. It may be copyrighted, and using it is the user's own decision. The assistant lists every such photo each time it delivers a reel, with the credits file attached.
- Photos live only in the project folder, never in this repository.
- The fetcher accepts only HTTPS and only JPEG, PNG or WebP files. It decodes and re-saves the picture, never runs anything it downloads, and refuses SVG.
- The one photo bundled in this repository is "Wicker Basket Containing Clay Coins" by Gary Todd, released as CC0. Its source is in `THIRD_PARTY_NOTICES.md`.

## Editing by hand in OpenFilm Studio

A finished reel (one with the recorded voice) is also exported as an OpenFilm project and opened in OpenFilm Studio, so it can be changed by hand. The skill's own renderer still makes the MP4.

- A draft cannot be opened in Studio.
- The first time Studio opens on this machine it may download about 100 MB. The assistant asks first. Studio needs Node 22.2 or newer.
- Studio is the user's. The assistant never closes or restarts it; close it yourself. Its address holds a temporary session key: the assistant gives it once, in the chat, and writes it to no file.
- The export makes no network call, and Studio's online features (generated voice, music, pictures) are not used.
- What you change in Studio lives only in the `openfilm/` folder. It does not change `story.json` or the MP4 the skill made. A clip you changed by hand is exported from Studio itself, and that file does not go through the skill's loudness check again.
- What was tried and what was not is in `skills/paim-reel/references/openfilm.md`.

## Re-branding

The brand is in `skills/paim-reel/brand.json`.

- `colors`: the four colours (`orange`, `green`, `charcoal`, `cream`) as `#RRGGBB`. Text colours are decided by role (charcoal on cream, charcoal on orange, cream on charcoal, cream on green), so pick new colours that still contrast enough; nothing re-measures contrast for new colours.
- `handle`, `logo`, `disclaimer`: defaults for the end card. Values saved by the first-run setup come first (see or change them with `node skills/paim-reel/scripts/profile.mjs show` and `set`).
- `fonts`: its shape is checked, but the typeface that is actually drawn is set in `skills/paim-reel/engine/style.css` and `skills/paim-reel/engine/runtime.mjs`.
- Sprites are drawn in the same four colours. The drawing request in `skills/paim-reel/scripts/image_cli.py` and the palette check in `skills/paim-reel/scripts/key_sprite.py` name them, so change those two files as well.
- All the brand rules are in `skills/paim-reel/references/brand.md`.

## The font

Sukhumvit Set ships with macOS and is used when it is present. This repository does not contain it and never copies its files, because it cannot be redistributed. Without it the skill uses IBM Plex Sans Thai (OFL-1.1), installed from npm, and says which one it used in the delivery report.

## Status: what has and has not been tested

This is version 1. The results below were measured on an Apple-silicon Mac (Apple M1 Pro, macOS 15, Node 22, Python 3.12).

**Tested**

- Automated tests: 291 Node tests passed (1 skipped: it needs the network and a real OpenFilm) and 178 Python tests passed (2 skipped, opt-in: a real image-tool call and the real speech model), none failing. The tests never call a real image tool. Every test recording is synthetic audio.
- A fresh assistant, given only this skill, made a reel from a recording end to end, including the stop where the user checks the script. The latest such run also covered the sound effects and the hand-off to Studio.
- A fresh assistant made a reel from a topic as far as the draft and the read-aloud sheet. The latest such run searched the web and fetched two real photos, recorded each one's source and the licence its page states, and wrote the credits file. In both kinds of run the sticker sprites came from a stand-in drawing tool.

**Not tested**

- The first-run setup with a real or a simulated user. (The text and the commands behind it have tests, but nobody has walked through the conversation.)
- A real human voice. Every test recording is synthetic.
- How the six sound effects sound. Nobody has listened to them. They are measured (length and level), not heard.
- The default speech model, `large-v3`. The tests used `small` and `tiny`.
- The Codex install end to end. Only the link is tested, in a temporary folder.
- Windows.

Known issues and small items not yet fixed are listed in [`docs/known-issues.md`](docs/known-issues.md). Always play the finished reel once before posting it: the assistant cannot hear the mix.

## Not in version 1

AI voice or a cloned voice (only the user's own recording is used) · AI-generated backgrounds, whole scenes or video · the cut-out collage look · bundled music (a user's own music file is supported at a fixed low level) · cutting stutters or false starts out of a take · horizontal video · a Claude Code plugin manifest · Windows testing · the OpenFilm hand-off for a draft.

Content is educational only: no promise of returns, no individual investment advice, and every figure on screen carries a source.

## Licence

MIT, see `LICENSE`. Third-party components and files are listed in `THIRD_PARTY_NOTICES.md`.
