from pathlib import Path
import fcntl,json,os,subprocess
os.umask(0o077)
root=Path('/private/tmp/nest-recipe-cancel-candidate-20261006');assert not root.exists();root.mkdir(mode=0o700)
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    subprocess.run(['tar','-xf','/private/tmp/nest-recipe-cancel-candidate-source.tar','-C',str(root)],check=True)
    paths=['Nest/Meals/RecipeCreateSheet.swift','Nest/Meals/RecipeEditSheet.swift','Nest/Meals/MealLibraryScreen.swift','Nest/Core/RecipeEditDraft.swift','Tests/Core/RecipeEditDraftTests.swift']
    files=[str(root/'apps/ios'/p) for p in paths]
    subprocess.run(['xcrun','swift-format','format','--configuration',str(root/'apps/ios/.swift-format'),'--in-place',*files],check=True)
    subprocess.run(['xcrun','swift-format','lint','--strict','--configuration',str(root/'apps/ios/.swift-format'),*files],check=True)
    (root/'formatted-files.json').write_text(json.dumps(paths)+'\n');print('Isolated five-file strict format passed',flush=True)
    with (root/'core-test.log').open('w') as log:
        result=subprocess.run(['swift','test','--package-path',str(root/'apps/ios'),'--scratch-path',str(root/'scratch'),'--filter','RecipeEditDraftTests'],stdout=log,stderr=subprocess.STDOUT)
    (root/'outcome.json').write_text(json.dumps({'strictFormat':True,'focusedCoreTestExitCode':result.returncode,'nativeUIOrHostedCommands':False})+'\n')
    print('Focused RecipeEditDraftTests exitCode='+str(result.returncode),flush=True)
finally:
    awake.terminate();awake.wait()
