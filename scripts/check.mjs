import {readdir} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
for(const dir of ['src','tests'])for(const file of await readdir(dir))if(/\.m?js$/.test(file)){const r=spawnSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});if(r.status)process.exit(r.status);}console.log('Sintaxe verificada.');
