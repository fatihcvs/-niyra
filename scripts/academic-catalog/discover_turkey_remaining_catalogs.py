"""Follow newly verified catalogue entry points with the common adapters."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from turkey_research import CACHE, ROOT, read, write, collect_program_pages
from discover_turkey_courses import discover_university

def main():
 academic=read(ROOT/'data/academic-catalog-2026.json')['universities']
 homes=read(CACHE/'expanded-homepages.json')
 homes += [h for h in read(CACHE/'homepages.json') if h['programs'][0]['universityId']=='tr-kahramanmaras-sutcu-imam-universitesi']
 output=[]
 with ThreadPoolExecutor(10) as pool:
  futures={pool.submit(discover_university,h,academic[h['programs'][0]['universityId']]):h['programs'][0]['universityId'] for h in homes}
  for f in as_completed(futures):
   try:r=f.result()
   except Exception as e:r={'universityId':futures[f],'matched':[],'error':str(e)}
   output.append(r);write(CACHE/'expanded-discovery.json',output);print(r['universityId'],len(r['matched']),flush=True)
 collect_program_pages(output,'expanded-courses')

if __name__=='__main__':main()
