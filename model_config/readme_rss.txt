☆☆☆所有命令请复制【】中全部内容。所有{}请替换为本机展现内容☆☆☆
☆☆☆所有命令请复制【】中全部内容。所有{}请替换为本机展现内容☆☆☆
☆☆☆所有命令请复制【】中全部内容。所有{}请替换为本机展现内容☆☆☆

一、拉取镜像：【docker pull saintvamp/auto_rss:latest】
二、创建容器：【docker run -d --network host \
--name=auto_rss \
-e TZ=Asia/Shanghai \
-e UI_PASSWORD={指定密码字符} \
-v /{RSS的父目录地址}/auto_rss/log:/auto_rss/log \
-v /{RSS的父目录地址}/auto_rss/config:/auto_rss/config \
-v /{RSS的父目录地址}/auto_rss/database:/auto_rss/database \
saintvamp/auto_rss:latest】
#自行修改-v中冒号前的文件夹地址后，执行一次，此时程序未运行，只是生成容器。
三、修改config中config.toml中的内容，配置说明见每个配置项后的说明文字。
四、源站点选择RSS，直接生成，查询对应的passkey字段

群共享有API调用小工具，可以下载使用。

Q&A：
Q1：config里的model-config.toml是干什么的？
A1：这个是最全的配置文件模版。在第一次创建容器后，需要配置config中的必备信息。
另外每次有model-config.toml的内容更新后，重启时程序会自动更新model-config.toml，并将config.toml缺少的配置项补全，但仍需要人工配置此类配置项的值。

Q2：配置中的RSS链接怎么填。
A2：从你想要发布的网站选择RSS后生成的链接中【是生成的链接中！！！不是控制面板的！！！】，只需要找到passkey对应的内容，比如原链接可能为【https://www.sv.com/rss?passkey=123321&cat=1&dl=true】那么passkey对应的就是【123321】