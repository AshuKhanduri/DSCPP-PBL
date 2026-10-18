<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.10.2" name="terrain" tilewidth="16" tileheight="16" tilecount="31" columns="8">
 <image source="terrain.png" width="128" height="64"/>
 <tile id="0">
  <properties>
   <property name="name" value="grass"/>
  </properties>
 </tile>
 <tile id="1">
  <properties>
   <property name="name" value="grass_light"/>
  </properties>
 </tile>
 <tile id="2">
  <properties>
   <property name="name" value="grass_dark"/>
  </properties>
 </tile>
 <tile id="3">
  <properties>
   <property name="name" value="grass_b"/>
  </properties>
 </tile>
 <tile id="4">
  <properties>
   <property name="name" value="sand"/>
   <property name="terrain" value="road"/>
  </properties>
 </tile>
 <tile id="5">
  <properties>
   <property name="name" value="dirt"/>
   <property name="terrain" value="hills"/>
  </properties>
 </tile>
 <tile id="6">
  <properties>
   <property name="name" value="dirt_dark"/>
   <property name="terrain" value="hills"/>
  </properties>
 </tile>
 <tile id="7">
  <properties>
   <property name="name" value="grass_c"/>
  </properties>
 </tile>
 <tile id="8">
  <properties>
   <property name="name" value="grass_d"/>
  </properties>
 </tile>
 <tile id="9">
  <properties>
   <property name="name" value="grass_forest"/>
   <property name="terrain" value="forest"/>
  </properties>
 </tile>
 <tile id="10">
  <properties>
   <property name="name" value="stone"/>
   <property name="terrain" value="road"/>
  </properties>
 </tile>
 <tile id="11">
  <properties>
   <property name="name" value="stone_b"/>
   <property name="terrain" value="road"/>
  </properties>
 </tile>
 <tile id="12">
  <properties>
   <property name="name" value="stone_dark"/>
  </properties>
 </tile>
 <tile id="13">
  <properties>
   <property name="name" value="stone_light"/>
  </properties>
 </tile>
 <tile id="14">
  <properties>
   <property name="name" value="water_deep"/>
   <property name="collides" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="15">
  <properties>
   <property name="name" value="water"/>
   <property name="collides" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="16">
  <properties>
   <property name="name" value="water_b"/>
   <property name="collides" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="17">
  <properties>
   <property name="name" value="marsh"/>
   <property name="terrain" value="marsh"/>
  </properties>
 </tile>
 <tile id="18">
  <properties>
   <property name="name" value="bridge"/>
   <property name="terrain" value="road"/>
  </properties>
 </tile>
 <tile id="19">
  <properties>
   <property name="name" value="flowerbed"/>
  </properties>
 </tile>
 <tile id="20">
  <properties>
   <property name="name" value="floor_purple"/>
  </properties>
 </tile>
 <tile id="21">
  <properties>
   <property name="name" value="stone_grey"/>
  </properties>
 </tile>
 <tile id="22">
  <properties>
   <property name="name" value="hedge"/>
   <property name="collides" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="23">
  <properties>
   <property name="name" value="floor_wood"/>
  </properties>
 </tile>
 <tile id="24">
  <properties>
   <property name="name" value="floor_wood_b"/>
  </properties>
 </tile>
 <tile id="25">
  <properties>
   <property name="name" value="floor_stone"/>
  </properties>
 </tile>
 <tile id="26">
  <properties>
   <property name="name" value="floor_grey"/>
  </properties>
 </tile>
 <tile id="27">
  <properties>
   <property name="name" value="wall_stone"/>
   <property name="collides" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="28">
  <properties>
   <property name="name" value="carpet_red"/>
  </properties>
 </tile>
 <tile id="29">
  <properties>
   <property name="name" value="wall_purple"/>
   <property name="collides" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="30">
  <properties>
   <property name="name" value="collision"/>
   <property name="collides" type="bool" value="true"/>
  </properties>
 </tile>
</tileset>
