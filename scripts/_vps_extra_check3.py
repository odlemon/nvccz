import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("31.220.82.129", port=2299, username="root", password="niakazi123", timeout=45, look_for_keys=False, allow_agent=False)

def run(cmd, t=90):
    _, o, _ = c.exec_command(cmd, get_pty=True, timeout=t)
    return o.read().decode("utf-8", "replace").encode("ascii", "replace").decode()

print(run("ls /var/www/projects/ | grep -E 'nts|client|dev'"))
print("--- pid 3009 ---")
print(run("ss -lntp | grep 3009; ps -p $(ss -lntp | grep 3009 | grep -oP 'pid=\\K[0-9]+' | head -1) -o pid,cmd 2>/dev/null"))
print("--- pm2 jlist names ---")
print(run("pm2 jlist 2>/dev/null | python3 -c \"import sys,json; d=json.load(sys.stdin); print('\\n'.join(f\\\"{x['pm_id']} {x['name']} {x.get('pm2_env',{}).get('status')} cwd={x.get('pm2_env',{}).get('pm_cwd')}\\\" for x in d))\""))
print("--- grep MANSA all projects shallow ---")
print(run("find /var/www/projects/nts /var/www/projects/client1 /var/www/projects/dev -maxdepth 2 -name '.env' -exec grep -l MANSA {} \\; 2>/dev/null"))
print(run("grep MANSA /var/www/projects/nts/.env /var/www/projects/client1/.env 2>/dev/null | sed 's/=.*$/=***/'"))
print("--- latest batch source types ---")
print(run("""curl -sS -m 20 'http://127.0.0.1:3009/api/investments/market-data/batches?pageSize=3' -H 'Authorization: Bearer skip' 2>/dev/null | head -c 200 || echo need-auth"""))
c.close()
