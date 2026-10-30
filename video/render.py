import subprocess,pathlib
r=pathlib.Path('/downloads/blankspace-video');times=[]
for i in range(1,7):
 dur=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(r/f'{i:02}.mp3')],text=True));times.append(dur)
 subprocess.run(['ffmpeg','-y','-loglevel','error','-ss','1.5','-i',str(r/f'scene-{i}.webm'),'-i',str(r/f'{i:02}.mp3'),'-t',str(dur),'-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',str(r/f'part-{i}.mp4')],check=True)
(r/'concat.txt').write_text(''.join(f"file '{r}/part-{i}.mp4'\n" for i in range(1,7)))
subprocess.run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i',str(r/'concat.txt'),'-c','copy','-movflags','+faststart','/downloads/publisher-call-sheet-walkthrough.mp4'],check=True)
print('duration',sum(times))
